from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
import yfinance as yf
import pandas as pd
import pandas_ta as ta
import numpy as np
import math
import asyncio
import os
import json
import re
import traceback
from concurrent.futures import ThreadPoolExecutor
from typing import List, Dict, Any, Optional

# ─────────────────────────────────────────────
# App Setup
# ─────────────────────────────────────────────
app = FastAPI(title="IDXScan API", description="Live backend for IDX Trending Stocks")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
executor = ThreadPoolExecutor(max_workers=8)

# ─────────────────────────────────────────────
# Caches
# ─────────────────────────────────────────────
# Lightweight ranked lists — updated every 5 min by background scanner
movers_cache: Dict[str, List[Dict]] = {}
idx_tickers_pool: List[str] = []

# ─────────────────────────────────────────────
# JSON Sanitizer — kills ALL numpy/nan/inf values
# ─────────────────────────────────────────────
def sanitize(obj: Any) -> Any:
    """Recursively convert numpy types, NaN, and Inf to JSON-safe Python types."""
    if isinstance(obj, dict):
        return {k: sanitize(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [sanitize(v) for v in obj]
    # Numpy integer types
    if isinstance(obj, (np.integer,)):
        return int(obj)
    # Numpy float types AND Python float
    if isinstance(obj, (np.floating, float)):
        if np.isnan(obj) or np.isinf(obj):
            return None
        return float(obj)
    # Numpy bool
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    # Numpy arrays — convert to list then recurse
    if isinstance(obj, np.ndarray):
        return sanitize(obj.tolist())
    return obj

# ─────────────────────────────────────────────
# Static routes (serve frontend)
# ─────────────────────────────────────────────
@app.get("/")
async def serve_index():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

@app.get("/index.html")
async def serve_index_html():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

# ─────────────────────────────────────────────
# IDX Ticker Pool
# ─────────────────────────────────────────────
FALLBACK_TICKERS = [
    "GOTO.JK", "BBRI.JK", "BBCA.JK", "BMRI.JK", "BREN.JK", "AMMN.JK",
    "TLKM.JK", "ASII.JK", "BBNI.JK", "BRPT.JK", "BUMI.JK", "PGEO.JK",
    "MEDC.JK", "ITMG.JK", "PTBA.JK", "ADRO.JK", "HEXA.JK", "UNTR.JK",
    "MPMX.JK", "INDF.JK", "KLBF.JK", "ANTM.JK", "MDKA.JK", "ICBP.JK",
    "PGAS.JK", "UNVR.JK", "HRUM.JK", "CPIN.JK", "AALI.JK", "AKRA.JK",
    "SMGR.JK", "MYOR.JK", "JPFA.JK", "SCMA.JK", "EXCL.JK", "ISAT.JK",
    "HMSP.JK", "GGRM.JK", "BSDE.JK", "CTRA.JK", "PWON.JK", "BJBR.JK",
    "BJTM.JK", "MBAP.JK", "BSSR.JK", "TOTL.JK", "HEXA.JK", "HRUM.JK",
]

HIGH_DIVIDEND_POOL = {
    "ITMG.JK", "PTBA.JK", "ADRO.JK", "HEXA.JK", "BSSR.JK", "UNTR.JK",
    "MPMX.JK", "BJBR.JK", "BJTM.JK", "MBAP.JK", "TOTL.JK", "ASII.JK",
    "TLKM.JK", "INDF.JK", "BBRI.JK", "HRUM.JK", "ICBP.JK", "SMGR.JK",
}

def load_idx_tickers() -> List[str]:
    """Load the full IDX ticker list from idx_tickers.js, fallback to curated pool."""
    js_path = os.path.join(FRONTEND_DIR, "idx_tickers.js")
    if os.path.exists(js_path):
        try:
            with open(js_path, "r", encoding="utf-8") as f:
                content = f.read()
            match = re.search(r'const\s+IDX_TICKERS\s*=\s*(\[.*\])\s*;', content, re.DOTALL)
            if match:
                data = json.loads(match.group(1))
                tickers = [f"{item['Code']}.JK" for item in data if item.get('Code')]
                print(f"[Startup] Loaded {len(tickers)} tickers from idx_tickers.js")
                return tickers
        except Exception as e:
            print(f"[Startup] Failed to parse idx_tickers.js: {e}")
    print(f"[Startup] Using fallback pool of {len(FALLBACK_TICKERS)} tickers.")
    return FALLBACK_TICKERS

# ─────────────────────────────────────────────
# Technical Analysis Engine
# ─────────────────────────────────────────────
def compute_indicators(df: pd.DataFrame) -> Dict[str, Any]:
    """Compute all technical indicators on a copy of the dataframe."""
    if len(df) < 14:
        return {}

    df = df.copy()
    df.ta.ema(length=50, append=True)
    df.ta.ema(length=200, append=True)
    df.ta.rsi(length=14, append=True)
    df.ta.macd(fast=12, slow=26, signal=9, append=True)
    df.ta.stoch(k=14, d=3, smooth_k=3, append=True)
    df.ta.atr(length=14, append=True)

    # Swing Support & Resistance (60-period window, 5-bar swing)
    period, swing = 60, 5
    highs, lows = [], []
    recent_df = df.tail(period)
    for i in range(swing, len(recent_df) - swing):
        window = recent_df.iloc[i - swing: i + swing + 1]
        center = window.iloc[swing]
        if center['High'] == window['High'].max():
            highs.append(float(center['High']))
        if center['Low'] == window['Low'].min():
            lows.append(float(center['Low']))

    current_price = float(df['Close'].iloc[-1])
    support    = max((l for l in lows  if l < current_price), default=float(recent_df['Low'].min()))
    resistance = min((h for h in highs if h > current_price), default=float(recent_df['High'].max()))

    # Fibonacci Retracement (60-period)
    min_price = float(recent_df['Low'].min())
    max_price = float(recent_df['High'].max())
    is_uptrend = recent_df['High'].idxmax() > recent_df['Low'].idxmin()
    diff = max_price - min_price
    fib_ratios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]
    fib_levels: Dict[str, float] = {}
    for lvl in fib_ratios:
        key = f"L{lvl * 100:.1f}"
        fib_levels[key] = (max_price - diff * lvl) if is_uptrend else (min_price + diff * lvl)

    def clean(col: str) -> List[Optional[float]]:
        if col not in df.columns:
            return [None] * len(df)
        return [None if (v is None or (isinstance(v, float) and (math.isnan(v) or math.isinf(v)))) else float(v) for v in df[col]]

    atr_val = 0.0
    if 'ATR_14' in df.columns:
        raw_atr = df['ATR_14'].iloc[-1]
        if pd.notna(raw_atr) and not math.isinf(float(raw_atr)):
            atr_val = float(raw_atr)

    return {
        "ema50":  clean('EMA_50'),
        "ema200": clean('EMA_200'),
        "rsi":    clean('RSI_14'),
        "macd": {
            "macdLine":   clean('MACD_12_26_9'),
            "signalLine": clean('MACDs_12_26_9'),
            "histogram":  clean('MACDh_12_26_9'),
        },
        "stoch": {
            "k": clean('STOCHk_14_3_3'),
            "d": clean('STOCHd_14_3_3'),
        },
        "sr":  {"support": support, "resistance": resistance},
        "atr": atr_val,
        "fib": {"levels": fib_levels},
    }

# ─────────────────────────────────────────────
# Report Generator
# ─────────────────────────────────────────────
# Helper to extract last valid scalar value
def _safe_last(arr: List[Optional[float]], default: float = 0.0) -> float:
    for v in reversed(arr):
        if v is not None and not math.isnan(v):
            return float(v)
    return default

def _compute_indicator_signals(
    latestPrice: float, rsi: float, macd: float, signal: float,
    prevMacd: float, prevSignal: float, ema50: float, ema200: float,
    stochK: float, stochD: float, s: float, r: float, volRatio: float,
    fib_levels: Dict[str, float]
) -> Dict[str, str]:
    """Compute string signals representing the status of individual indicators."""
    rsiSignal = 'Overbought' if rsi > 70 else 'Oversold' if rsi < 30 else 'Neutral'
    
    macdSignal = 'Neutral'
    if macd > signal and prevMacd <= prevSignal: macdSignal = 'Bullish Crossover'
    elif macd < signal and prevMacd >= prevSignal: macdSignal = 'Bearish Crossover'
    elif macd > signal: macdSignal = 'Bullish Momentum'
    elif macd < signal: macdSignal = 'Bearish Momentum'

    emaSignal = 'Neutral'
    if latestPrice > ema50 > ema200: emaSignal = 'Strong Uptrend'
    elif latestPrice < ema50 < ema200: emaSignal = 'Strong Downtrend'
    elif latestPrice > ema200: emaSignal = 'Bullish Support'
    elif latestPrice < ema200: emaSignal = 'Bearish Resistance'

    srSignal = 'Neutral'
    if   s and latestPrice <= s * 1.03: srSignal = 'At Support'
    elif r and latestPrice >= r * 0.97: srSignal = 'At Resistance'
    elif s and r and latestPrice > (s + r) / 2: srSignal = 'Upper Half'
    else: srSignal = 'Lower Half'

    volSignal = 'Normal'
    if volRatio > 2: volSignal = 'Extremely High Vol'
    elif volRatio > 1.3: volSignal = 'High Volume'
    elif volRatio < 0.7: volSignal = 'Low Volume'

    stochSignal = 'Neutral'
    if stochK > stochD and stochK < 20: stochSignal = 'Bullish Cross (Oversold)'
    elif stochK < stochD and stochK > 80: stochSignal = 'Bearish Cross (Overbought)'
    elif stochK > 80: stochSignal = 'Overbought'
    elif stochK < 20: stochSignal = 'Oversold'

    fibSignal = 'Between Levels'
    if fib_levels:
        closest = min(fib_levels, key=lambda k: abs(fib_levels[k] - latestPrice))
        if (abs(latestPrice - fib_levels[closest]) / latestPrice) * 100 < 2:
            fibSignal = f"Near {closest} (Rp {math.floor(fib_levels[closest]):,})"

    return {
        "rsiSignal": rsiSignal,
        "macdSignal": macdSignal,
        "emaSignal": emaSignal,
        "srSignal": srSignal,
        "volSignal": volSignal,
        "stochSignal": stochSignal,
        "fibSignal": fibSignal
    }

def _evaluate_recommendation(
    rsi: float, stochK: float, stochD: float,
    signals: Dict[str, str]
) -> tuple[str, str]:
    """Determine trading recommendation and styling class based on signals."""
    emaSignal = signals["emaSignal"]
    macdSignal = signals["macdSignal"]
    volSignal = signals["volSignal"]
    stochSignal = signals["stochSignal"]
    srSignal = signals["srSignal"]

    isUptrend    = 'Uptrend' in emaSignal or 'Support' in emaSignal
    isDowntrend  = 'Downtrend' in emaSignal or 'Resistance' in emaSignal
    macdBullish  = 'Bullish' in macdSignal
    macdBearish  = 'Bearish' in macdSignal
    isHighVol    = 'High' in volSignal
    isHealthyRsi = 40 <= rsi <= 65
    isOverbought = rsi > 70
    isOversold   = rsi < 30
    stochBullish = 'Bullish' in stochSignal
    atSupport    = srSignal == 'At Support'
    atResistance = srSignal == 'At Resistance'

    recommendation, badgeClass = 'WAIT AND SEE', 'badge-neutral'
    if isUptrend and macdBullish and isHighVol and isHealthyRsi and (stochBullish or stochK > stochD):
        recommendation, badgeClass = 'STRONG BUY', 'badge-bullish'
    elif isDowntrend and macdBearish and isHighVol:
        recommendation, badgeClass = 'STRONG SELL', 'badge-bearish'
    elif atResistance and isOverbought:
        recommendation, badgeClass = 'TAKE PROFIT', 'badge-bearish'
    elif atSupport and (isOversold or stochBullish):
        recommendation, badgeClass = 'ACCUMULATE', 'badge-bullish'
    elif isUptrend and (isOverbought or not macdBullish):
        recommendation, badgeClass = 'HOLD', 'badge-bullish'

    return recommendation, badgeClass

def _create_trading_plan(
    recommendation: str, latestPrice: float, s: float, r: float, atr: float
) -> Dict[str, Any]:
    """Calculate entry range, stop loss, and take profit bounds for the trading plan."""
    tp, sl, entryStr = 0, 0, '--'
    if recommendation in ('STRONG BUY', 'ACCUMULATE') and s and r and atr:
        entryStr = f"Rp {math.floor(s):,} - Rp {math.floor(latestPrice):,}"
        sl = math.floor(s - 1.5 * atr)
        tp = math.floor(r * 0.99) if r * 0.99 > latestPrice else math.floor(latestPrice + 3 * atr)
    elif recommendation in ('STRONG SELL', 'TAKE PROFIT') and s and r and atr:
        entryStr = f"Rp {math.floor(latestPrice):,} - Rp {math.floor(r):,}"
        sl = math.floor(r + 1.5 * atr)
        tp = math.floor(s * 1.01) if s * 1.01 < latestPrice else math.floor(latestPrice - 3 * atr)
    elif recommendation == 'HOLD' and r and atr:
        entryStr = "No New Entry"
        sl = math.floor(latestPrice - 1.5 * atr)
        tp = math.floor(r * 0.99)

    return {
        "entry":      entryStr,
        "sl":         f"Rp {sl:,}" if sl > 0 else "--",
        "tp":         f"Rp {tp:,}" if tp > 0 else "--",
        "support":    f"Rp {math.floor(s):,}" if s else "--",
        "resistance": f"Rp {math.floor(r):,}" if r else "--",
    }

def _generate_narrative_comment(
    signals: Dict[str, str]
) -> str:
    """Build narrative commentary summarizing active technical highlights."""
    emaSignal = signals["emaSignal"]
    macdSignal = signals["macdSignal"]
    volSignal = signals["volSignal"]
    stochSignal = signals["stochSignal"]
    srSignal = signals["srSignal"]

    isUptrend    = 'Uptrend' in emaSignal or 'Support' in emaSignal
    isDowntrend  = 'Downtrend' in emaSignal or 'Resistance' in emaSignal
    macdBullish  = 'Bullish' in macdSignal
    macdBearish  = 'Bearish' in macdSignal
    isHighVol    = 'High' in volSignal
    stochBullish = 'Bullish' in stochSignal
    atSupport    = srSignal == 'At Support'
    atResistance = srSignal == 'At Resistance'

    parts = []
    if   isUptrend:   parts.append("Stock is in an uptrend")
    elif isDowntrend: parts.append("Stock is in a downtrend")
    else:             parts.append("Stock is moving sideways")
    
    if   macdBullish: parts.append("with bullish MACD momentum")
    elif macdBearish: parts.append("with bearish MACD momentum")
    
    if   isHighVol:   parts.append("supported by high trading volume.")
    else:             parts.append("on average volume.")
    
    if   'Overbought' in stochSignal: parts.append("Warning: RSI indicates overbought conditions.")
    elif 'Oversold' in stochSignal:   parts.append("Note: RSI is oversold — potential bounce ahead.")
    
    if   stochBullish: parts.append("Stochastic shows bullish momentum.")
    if   atSupport:    parts.append("Price is near a key support level.")
    if   atResistance: parts.append("Price is approaching a resistance zone.")

    return " ".join(parts)

def generate_report(ticker: str, df: pd.DataFrame, indicators: Dict[str, Any]) -> Dict[str, Any]:
    latestPrice = float(df['Close'].iloc[-1])
    prevPrice   = float(df['Close'].iloc[-2])
    priceChange = latestPrice - prevPrice
    pctChange   = (priceChange / prevPrice) * 100 if prevPrice != 0 else 0.0

    # Extract indicator parameters
    rsi    = _safe_last(indicators.get('rsi', []), 50)
    macd   = _safe_last(indicators.get('macd', {}).get('macdLine', []), 0)
    signal = _safe_last(indicators.get('macd', {}).get('signalLine', []), 0)
    macd_line   = indicators.get('macd', {}).get('macdLine', [])
    signal_line = indicators.get('macd', {}).get('signalLine', [])
    prevMacd   = _safe_last(macd_line[:-1], 0)   if len(macd_line)   > 1 else 0
    prevSignal = _safe_last(signal_line[:-1], 0) if len(signal_line) > 1 else 0

    ema50  = _safe_last(indicators.get('ema50',  []), latestPrice)
    ema200 = _safe_last(indicators.get('ema200', []), latestPrice)
    stochK = _safe_last(indicators.get('stoch', {}).get('k', []), 50)
    stochD = _safe_last(indicators.get('stoch', {}).get('d', []), 50)
    atr    = indicators.get('atr', 0) or 0
    sr     = indicators.get('sr', {"support": 0, "resistance": 0})
    s      = sr.get('support', 0) or 0
    r      = sr.get('resistance', 0) or 0

    avgVol   = float(df['Volume'].tail(20).mean())
    latestVol = float(df['Volume'].iloc[-1])
    volRatio  = (latestVol / avgVol) if avgVol > 0 else 1.0

    fib_levels = indicators.get('fib', {}).get('levels', {})

    # Single responsibility helper delegates
    signals = _compute_indicator_signals(
        latestPrice, rsi, macd, signal, prevMacd, prevSignal,
        ema50, ema200, stochK, stochD, s, r, volRatio, fib_levels
    )
    recommendation, badgeClass = _evaluate_recommendation(rsi, stochK, stochD, signals)
    plan = _create_trading_plan(recommendation, latestPrice, s, r, atr)
    comment = _generate_narrative_comment(signals)

    return {
        "latestPrice":    latestPrice,
        "priceChange":    priceChange,
        "pctChange":      pctChange,
        "rsi":            rsi,
        "macd":           macd,
        "signal":         signal,
        "ema50":          ema50,
        "ema200":         ema200,
        "sma20":          ema50,
        "rsiSignal":      signals["rsiSignal"],
        "macdSignal":     signals["macdSignal"],
        "emaSignal":      signals["emaSignal"],
        "sr":             {"support": s, "resistance": r},
        "srSignal":       signals["srSignal"],
        "vol":            {"latestVol": latestVol, "avgVol": avgVol, "ratio": volRatio},
        "volSignal":      signals["volSignal"],
        "stoch":          {"k": stochK, "d": stochD},
        "stochSignal":    signals["stochSignal"],
        "fibSignal":      signals["fibSignal"],
        "recommendation": recommendation,
        "badgeClass":     badgeClass,
        "analysisComment": comment,
        "tradingPlan":    plan,
    }

# ─────────────────────────────────────────────
# Core Ticker Processor (synchronous — call via executor)
# ─────────────────────────────────────────────
def _process_ticker_sync(ticker: str, period: str = "1y") -> Dict[str, Any]:
    ticker = ticker.upper()
    if not ticker.endswith('.JK'):
        ticker += '.JK'

    VALID_PERIODS = {"1d","5d","1mo","3mo","6mo","1y","2y","5y","10y","ytd","max"}
    if period not in VALID_PERIODS:
        print(f"[API] Invalid period '{period}' for {ticker}, defaulting to '1y'")
        period = "1y"

    t = yf.Ticker(ticker)
    df = t.history(period=period)
    if df is None or df.empty:
        raise ValueError(f"No data returned for {ticker}")

    df = df.dropna(subset=['Open', 'High', 'Low', 'Close', 'Volume'])
    if len(df) < 15:
        raise ValueError(f"Insufficient data for {ticker} ({len(df)} rows)")

    indicators = compute_indicators(df)
    report     = generate_report(ticker, df, indicators)

    raw_data = [
        {
            "time":   index.strftime('%Y-%m-%d'),
            "open":   float(row['Open']),
            "high":   float(row['High']),
            "low":    float(row['Low']),
            "close":  float(row['Close']),
            "volume": int(row['Volume']),
        }
        for index, row in df.iterrows()
    ]

    try:
        fi = t.fast_info
        meta = {
            "longName":            getattr(fi, 'company_name', ticker) or ticker,
            "regularMarketVolume": int(getattr(fi, 'last_volume', 0) or 0),
            "fiftyTwoWeekHigh":    float(getattr(fi, 'year_high', 0) or 0),
            "fiftyTwoWeekLow":     float(getattr(fi, 'year_low', 0) or 0),
        }
    except Exception:
        meta = {"longName": ticker, "regularMarketVolume": 0,
                "fiftyTwoWeekHigh": 0, "fiftyTwoWeekLow": 0}

    return {
        "ticker":     ticker,
        "data":       raw_data,
        "indicators": indicators,
        "report":     report,
        "meta":       meta,
    }

# ─────────────────────────────────────────────
# API Endpoints
# ─────────────────────────────────────────────
@app.get("/api/ticker/{ticker}")
async def get_ticker_data(ticker: str, period: str = "1y"):
    """Fetch OHLCV + indicators + report for a single ticker."""
    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(executor, _process_ticker_sync, ticker, period)
        return JSONResponse(content=sanitize(result))
    except Exception as e:
        print(f"[API] Error processing {ticker}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/movers/{mover_type}")
async def get_market_movers(mover_type: str):
    """Return ranked market movers from the background cache (lightweight, instant)."""
    valid_types = {"gainers", "losers", "active", "dividend"}
    if mover_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Unknown type. Valid: {valid_types}")

    if mover_type not in movers_cache or not movers_cache[mover_type]:
        return JSONResponse(content={
            "movers": [],
            "status": "cache_warming",
            "message": "Market data is still loading. Please wait ~30 seconds and try again."
        })

    return JSONResponse(content=sanitize({
        "movers": movers_cache[mover_type],
        "status": "ok"
    }))


@app.get("/api/status")
async def get_status():
    return {
        "status": "running",
        "ticker_pool": len(idx_tickers_pool),
        "cache_keys": list(movers_cache.keys()),
        "cache_counts": {k: len(v) for k, v in movers_cache.items()},
    }

# ─────────────────────────────────────────────
# Background Market Scanner
# Stores lightweight ranked rows ONLY.
# Full indicator analysis is loaded per-ticker on demand.
# ─────────────────────────────────────────────
def _parse_ticker_summaries(raw_data: Any, tickers: List[str]) -> List[Dict]:
    """Parse raw downloaded multi-ticker dataframes into light summary metrics."""
    summary = []
    single_ticker = len(tickers) == 1

    for t in tickers:
        try:
            df = raw_data if single_ticker else raw_data.get(t)
            if df is None or df.empty or len(df) < 2:
                continue

            df = df.dropna(subset=['Close', 'Volume'])
            if len(df) < 2:
                continue

            close_last = float(df['Close'].iloc[-1])
            close_prev = float(df['Close'].iloc[-2])
            volume     = float(df['Volume'].iloc[-1])

            if close_prev <= 0 or math.isnan(close_last) or math.isnan(close_prev):
                continue

            pct_change = ((close_last - close_prev) / close_prev) * 100
            if math.isnan(pct_change) or math.isinf(pct_change):
                continue

            summary.append({
                "ticker":    t,
                "price":     round(close_last, 2),
                "pctChange": round(pct_change, 4),
                "volume":    volume,
            })
        except Exception as e:
            print(f"[Scanner] Skipped summary parse for {t}: {e}")
            
    return summary

def _cache_sorted_movers(summary: List[Dict]) -> None:
    """Sort and update global movers lists cache pools."""
    movers_cache["gainers"] = sorted(
        summary, key=lambda x: x["pctChange"], reverse=True
    )[:20]

    movers_cache["losers"] = sorted(
        summary, key=lambda x: x["pctChange"]
    )[:20]

    movers_cache["active"] = sorted(
        summary, key=lambda x: x["volume"], reverse=True
    )[:20]

    div_pool = [s for s in summary if s["ticker"] in HIGH_DIVIDEND_POOL]
    movers_cache["dividend"] = sorted(
        div_pool, key=lambda x: x["volume"], reverse=True
    )[:20]

async def _background_scan():
    """Continuously rank all IDX stocks and cache sorted lightweight movers."""
    while True:
        print(f"[Scanner] Starting scan of {len(idx_tickers_pool)} tickers...")
        try:
            tickers = idx_tickers_pool
            loop    = asyncio.get_event_loop()

            # Batch-download 5 days in one call
            raw = await loop.run_in_executor(
                executor,
                lambda: yf.download(
                    tickers,
                    period="5d",
                    group_by="ticker",
                    progress=False,
                    auto_adjust=True,
                    threads=True,
                )
            )

            summary = _parse_ticker_summaries(raw, tickers)
            if not summary:
                print("[Scanner] No results. Will retry in 60s.")
                await asyncio.sleep(60)
                continue

            print(f"[Scanner] Ranked {len(summary)} tickers.")
            _cache_sorted_movers(summary)

            print(
                f"[Scanner] Done — gainers={len(movers_cache['gainers'])}, "
                f"losers={len(movers_cache['losers'])}, "
                f"active={len(movers_cache['active'])}, "
                f"dividend={len(movers_cache['dividend'])}"
            )

        except Exception as e:
            print(f"[Scanner] Scan failed: {e}")
            traceback.print_exc()

        await asyncio.sleep(300)  # rescan every 5 min


@app.on_event("startup")
async def startup_event():
    global idx_tickers_pool
    idx_tickers_pool = load_idx_tickers()
    asyncio.create_task(_background_scan())


# Mount static files LAST so API routes are not shadowed
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=18080)
