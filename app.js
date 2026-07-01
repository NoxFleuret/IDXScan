// Constants & Configurations
const TICKERS = [
  'BBCA.JK', 'BBRI.JK', 'TLKM.JK', 'GOTO.JK', 'ASII.JK',
  'BMRI.JK', 'BBNI.JK', 'ADRO.JK', 'UNVR.JK', 'PGAS.JK',
  'ANTM.JK', 'KLBF.JK', 'CPIN.JK', 'ICBP.JK', 'INDF.JK',
  'HRUM.JK', 'MEDC.JK', 'ITMG.JK', 'PTBA.JK', 'MDKA.JK'
];

const TICKER_NAMES = {
  'BBCA.JK': 'Bank Central Asia Tbk.',
  'BBRI.JK': 'Bank Rakyat Indonesia (Persero) Tbk.',
  'TLKM.JK': 'Telkom Indonesia (Persero) Tbk.',
  'GOTO.JK': 'GoTo Gojek Tokopedia Tbk.',
  'ASII.JK': 'Astra International Tbk.',
  'BMRI.JK': 'Bank Mandiri (Persero) Tbk.',
  'BBNI.JK': 'Bank Negara Indonesia (Persero) Tbk.',
  'ADRO.JK': 'Adaro Energy Indonesia Tbk.',
  'UNVR.JK': 'Unilever Indonesia Tbk.',
  'PGAS.JK': 'Perusahaan Gas Negara Tbk.',
  'ANTM.JK': 'Aneka Tambang Tbk.',
  'KLBF.JK': 'Kalbe Farma Tbk.',
  'CPIN.JK': 'Charoen Pokphand Indonesia Tbk.',
  'ICBP.JK': 'Indofood CBP Sukses Makmur Tbk.',
  'INDF.JK': 'Indofood Sukses Makmur Tbk.',
  'HRUM.JK': 'Harum Energy Tbk.',
  'MEDC.JK': 'Medco Energi Internasional Tbk.',
  'ITMG.JK': 'Indo Tambangraya Megah Tbk.',
  'PTBA.JK': 'Bukit Asam Tbk.',
  'MDKA.JK': 'Merdeka Copper Gold Tbk.'
};

// API base URL configuration (uses relative paths if served by FastAPI, falls back to 127.0.0.1:18080 if file is opened locally)
const API_BASE = window.location.protocol === 'file:' ? 'http://127.0.0.1:18080' : '';

// State Store
const state = {
  stocksData: {},      // Store data of scanned stocks
  trendingList: [],    // Store list of ranked trending stocks
  activeTicker: 'BBCA.JK',
  activeChartData: null,
  activeIndicators: null,
  activeRange: '1y',   // 1mo, 3mo, 6mo, 1y — sent to backend API
  activeMoversType: 'active', // gainers | losers | active | dividend
  isLoading: false,
  charts: {
    priceChart: null,
    rsiChart: null,
    macdChart: null,
    candleSeries: null,
    sma20Line: null,
    ema50Line: null,
    ema200Line: null,
    rsiSeries: null,
    macdSeries: null,
    macdSignalSeries: null,
    macdHistSeries: null,
    priceLines: []     // Fix 9+10: track all price lines for clean removal
  }
};

// Removed generateMockData and createRandom per user request.

// Fetch historical data & technical analysis from FastAPI Backend
async function fetchTickerData(ticker, period) {
  const p = period || state.activeRange || '1y';
  try {
    const response = await fetch(`${API_BASE}/api/ticker/${ticker}?period=${p}`);
    if (!response.ok) throw new Error("Backend API Error");
    return await response.json();
  } catch (e) {
    console.warn(`Backend failed for ticker ${ticker}:`, e);
    throw new Error(`Failed to fetch data for ${ticker}. Make sure the Python backend is running.`);
  }
}

// HTML Escaping Helper to mitigate XSS vulnerabilities
function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Watchlist Local Storage Helper Functions
function getWatchlist() {
  try {
    const list = localStorage.getItem('idx_watchlist');
    return list ? JSON.parse(list) : [];
  } catch (e) {
    return [];
  }
}

function toggleWatchlist(ticker) {
  let list = getWatchlist();
  if (list.includes(ticker)) {
    list = list.filter(t => t !== ticker);
  } else {
    list.push(ticker);
  }
  localStorage.setItem('idx_watchlist', JSON.stringify(list));
  updateWatchlistButtonState(ticker);
}

function updateWatchlistButtonState(ticker) {
  const btn = document.getElementById('save-watchlist-btn');
  if (!btn) return;
  const list = getWatchlist();
  const icon = btn.querySelector('i');
  if (list.includes(ticker)) {
    btn.classList.add('bg-indigo-600/30', 'text-indigo-400', 'border-indigo-500/30');
    btn.classList.remove('bg-white/5', 'text-gray-400', 'border-white/10');
    btn.title = "Remove from Watchlist";
    btn.setAttribute('aria-label', "Remove from Watchlist");
    if (icon) {
      icon.setAttribute('data-lucide', 'bookmark-check');
      icon.innerHTML = '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/><path d="m9 10 2 2 4-4"/>';
    }
  } else {
    btn.classList.remove('bg-indigo-600/30', 'text-indigo-400', 'border-indigo-500/30');
    btn.classList.add('bg-white/5', 'text-gray-400', 'border-white/10');
    btn.title = "Save to Watchlist";
    btn.setAttribute('aria-label', "Save to Watchlist");
    if (icon) {
      icon.setAttribute('data-lucide', 'bookmark');
      icon.innerHTML = '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>';
    }
  }
}

async function loadWatchlistTab() {
  const tableTitle = document.getElementById('trending-table-title');
  if (tableTitle) {
    tableTitle.innerText = `My Watchlist`;
  }

  const tbody = document.getElementById('trending-table-body');
  tbody.classList.add('opacity-40');
  document.getElementById('scanner-loading-indicator').classList.remove('hidden');

  const watchlist = getWatchlist();
  if (watchlist.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="px-4 py-8 text-center text-gray-500 text-sm">
          <div class="flex flex-col items-center justify-center space-y-2 py-4">
            <i data-lucide="bookmark" class="w-8 h-8 text-gray-600"></i>
            <span class="font-bold text-gray-400">Your Watchlist is empty</span>
            <span class="text-xs text-gray-600">Search for stocks and click the bookmark icon to save them here.</span>
          </div>
        </td>
      </tr>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    document.getElementById('scanner-loading-indicator').classList.add('hidden');
    tbody.classList.remove('opacity-40');
    return;
  }

  try {
    const promises = watchlist.map(async (ticker) => {
      if (state.stocksData[ticker] && state.stocksData[ticker].report) {
        return state.stocksData[ticker];
      }
      try {
        const info = await fetchTickerData(ticker);
        return {
          ticker,
          name: info.meta?.longName || TICKER_NAMES[ticker] || ticker.replace('.JK', ''),
          price: info.report.latestPrice,
          pctChange: info.report.pctChange,
          volume: info.report.vol?.latestVol || 0,
          volumeRatio: info.report.vol?.ratio ?? 1.0,
          recommendation: info.report.recommendation,
          badgeClass: info.report.badgeClass,
          report: info.report,
          data: info.data,
          indicators: info.indicators,
          meta: info.meta
        };
      } catch (err) {
        console.warn(`Failed to fetch watchlist quote for ${ticker}:`, err);
        return null;
      }
    });

    const results = (await Promise.all(promises)).filter(r => r !== null);
    
    results.forEach(curr => {
      state.stocksData[curr.ticker] = curr;
    });

    state.activeMoversType = 'watchlist';
    state.trendingList = results;
    
    renderTrendingList();
  } catch (e) {
    console.error("Watchlist load failed", e);
    tbody.innerHTML = `
      <tr><td colspan="6" class="px-4 py-8 text-center text-rose-500">Failed to load watchlist quotes.</td></tr>
    `;
  } finally {
    document.getElementById('scanner-loading-indicator').classList.add('hidden');
    tbody.classList.remove('opacity-40');
  }
}

// Debounce helper to optimize resize listener on mobile devices
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// Initialize Charts
function initCharts() {
  const priceContainer = document.getElementById('price-chart-container');
  const rsiContainer = document.getElementById('rsi-chart-container');
  const macdContainer = document.getElementById('macd-chart-container');

  priceContainer.innerHTML = '';
  rsiContainer.innerHTML = '';
  macdContainer.innerHTML = '';

  const commonOptions = {
    layout: {
      backgroundColor: '#111827',
      textColor: '#9ca3af',
      fontSize: 11
    },
    grid: {
      vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
      horzLines: { color: 'rgba(255, 255, 255, 0.05)' }
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal
    },
    timeScale: {
      borderColor: 'rgba(255, 255, 255, 0.1)',
      timeVisible: true
    }
  };

  // 1. Price Chart
  const priceChart = LightweightCharts.createChart(priceContainer, {
    ...commonOptions,
    height: 500,
    rightPriceScale: { borderColor: 'rgba(255, 255, 255, 0.1)' }
  });

  const candleSeries = priceChart.addCandlestickSeries({
    upColor: '#10b981',
    downColor: '#ef4444',
    borderDownColor: '#ef4444',
    borderUpColor: '#10b981',
    wickDownColor: '#ef4444',
    wickUpColor: '#10b981'
  });

  const volumeSeries = priceChart.addHistogramSeries({
    color: 'rgba(56, 189, 248, 0.4)',
    priceFormat: { type: 'volume' },
    priceScaleId: '', 
  });
  priceChart.priceScale('').applyOptions({
    scaleMargins: { top: 0.8, bottom: 0 },
  });

  const sma20Line = priceChart.addLineSeries({ color: '#f59e0b', lineWidth: 1.5, title: 'SMA 20' });
  const ema50Line = priceChart.addLineSeries({ color: '#3b82f6', lineWidth: 1.5, title: 'EMA 50' });
  const ema200Line = priceChart.addLineSeries({ color: '#8b5cf6', lineWidth: 1.5, title: 'EMA 200' });

  // 2. RSI Chart
  const rsiChart = LightweightCharts.createChart(rsiContainer, {
    ...commonOptions,
    height: 120,
    rightPriceScale: { borderColor: 'rgba(255, 255, 255, 0.1)' }
  });

  const rsiSeries = rsiChart.addLineSeries({ color: '#fbbf24', lineWidth: 1.5, title: 'RSI' });

  // Add boundary markers for RSI


  // 3. MACD Chart
  const macdChart = LightweightCharts.createChart(macdContainer, {
    ...commonOptions,
    height: 150,
    rightPriceScale: { borderColor: 'rgba(255, 255, 255, 0.1)' }
  });

  const macdSeries = macdChart.addLineSeries({ color: '#3b82f6', lineWidth: 1.5, title: 'MACD' });
  const macdSignalSeries = macdChart.addLineSeries({ color: '#ef4444', lineWidth: 1.5, title: 'Signal' });
  const macdHistSeries = macdChart.addHistogramSeries({
    color: '#10b981',
    base: 0
  });

  // 4. Stochastic Chart
  const stochContainer = document.getElementById('stoch-chart-container');
  stochContainer.innerHTML = '';
  const stochChart = LightweightCharts.createChart(stochContainer, {
    ...commonOptions,
    height: 120,
    rightPriceScale: { borderColor: 'rgba(255, 255, 255, 0.1)' }
  });
  
  const stochKSeries = stochChart.addLineSeries({ color: '#f472b6', lineWidth: 1.5, title: '%K' });
  const stochDSeries = stochChart.addLineSeries({ color: '#c084fc', lineWidth: 1.5, title: '%D' });

  // Sync Timescales
  function syncRange(targetChart, range) {
    if (!range || !targetChart || range.from === null || range.to === null) return;
    const current = targetChart.timeScale().getVisibleRange();
    if (!current || current.from !== range.from || current.to !== range.to) {
      try {
        targetChart.timeScale().setVisibleRange(range);
      } catch (err) {
        console.warn("Timescale sync skipped due to initialization state:", err);
      }
    }
  }

  priceChart.timeScale().subscribeVisibleTimeRangeChange((range) => {
    if (range) {
      syncRange(rsiChart, range);
      syncRange(macdChart, range);
      syncRange(stochChart, range);
    }
  });
  
  rsiChart.timeScale().subscribeVisibleTimeRangeChange((range) => {
    if (range) {
      syncRange(priceChart, range);
      syncRange(macdChart, range);
      syncRange(stochChart, range);
    }
  });

  macdChart.timeScale().subscribeVisibleTimeRangeChange((range) => {
    if (range) {
      syncRange(priceChart, range);
      syncRange(rsiChart, range);
      syncRange(stochChart, range);
    }
  });

  stochChart.timeScale().subscribeVisibleTimeRangeChange((range) => {
    if (range) {
      syncRange(priceChart, range);
      syncRange(rsiChart, range);
      syncRange(macdChart, range);
    }
  });

  state.charts = {
    priceChart, rsiChart, macdChart, stochChart,
    candleSeries, volumeSeries, sma20Line, ema50Line, ema200Line,
    rsiSeries, macdSeries, macdSignalSeries, macdHistSeries,
    stochKSeries, stochDSeries,
    priceLines: []
  };

  // Make charts responsive (debounced to avoid layout thrashing on mobile scrolls)
  window.addEventListener('resize', debounce(() => {
    if (priceChart && priceContainer) priceChart.resize(priceContainer.clientWidth, 500);
    if (rsiChart && rsiContainer) rsiChart.resize(rsiContainer.clientWidth, 120);
    if (macdChart && macdContainer) macdChart.resize(macdContainer.clientWidth, 150);
    if (stochChart && stochContainer) stochChart.resize(stochContainer.clientWidth, 120);
  }, 150));
}

// Update charts with loaded ticker data
function updateCharts(data, indicators) {
  const {
    candleSeries, volumeSeries, sma20Line, ema50Line, ema200Line,
    rsiSeries, macdSeries, macdSignalSeries, macdHistSeries,
    stochKSeries, stochDSeries, priceLines
  } = state.charts;

  // Clear previous price lines
  if (priceLines) {
    priceLines.forEach(line => candleSeries.removePriceLine(line));
  }
  state.charts.priceLines = [];

  // Filter valid candle entries
  const validCandles = data.filter(d => 
    d && 
    typeof d.open === 'number' && !isNaN(d.open) &&
    typeof d.high === 'number' && !isNaN(d.high) &&
    typeof d.low === 'number' && !isNaN(d.low) &&
    typeof d.close === 'number' && !isNaN(d.close)
  ).map(d => ({
    time: d.time,
    open: d.open,
    high: d.high,
    low: d.low,
    close: d.close
  }));
  candleSeries.setData(validCandles);

  // Map backend arrays into lightweight-charts format
  const mapIndicator = (arr) => {
    if (!arr) return [];
    const result = [];
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] !== null && arr[i] !== undefined && !isNaN(arr[i])) {
        result.push({ time: data[i].time, value: arr[i] });
      }
    }
    return result;
  };

  sma20Line.setData(mapIndicator(indicators.sma20 || indicators.ema50)); // Fallback if sma20 is missing
  ema50Line.setData(mapIndicator(indicators.ema50));
  ema200Line.setData(mapIndicator(indicators.ema200));
  rsiSeries.setData(mapIndicator(indicators.rsi));

  macdSeries.setData(mapIndicator(indicators.macd.macdLine));
  macdSignalSeries.setData(mapIndicator(indicators.macd.signalLine));
  
  const histArr = indicators.macd.histogram || [];
  const histData = [];
  for (let i = 0; i < histArr.length; i++) {
    if (histArr[i] !== null && histArr[i] !== undefined) {
      histData.push({
        time: data[i].time,
        value: histArr[i],
        color: histArr[i] >= 0 ? 'rgba(16, 185, 129, 0.6)' : 'rgba(239, 68, 68, 0.6)'
      });
    }
  }
  macdHistSeries.setData(histData);

  stochKSeries.setData(mapIndicator(indicators.stoch.k));
  stochDSeries.setData(mapIndicator(indicators.stoch.d));

  const volumeData = data.map(d => ({
    time: d.time,
    value: d.volume,
    color: d.close >= d.open ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'
  }));
  volumeSeries.setData(volumeData);

  if (indicators.sr.support) {
    const line = candleSeries.createPriceLine({ price: indicators.sr.support, color: '#10b981', lineWidth: 1, lineStyle: 2, title: 'Support' });
    state.charts.priceLines.push(line);
  }
  if (indicators.sr.resistance) {
    const line = candleSeries.createPriceLine({ price: indicators.sr.resistance, color: '#ef4444', lineWidth: 1, lineStyle: 2, title: 'Resistance' });
    state.charts.priceLines.push(line);
  }
  
  if (indicators.fib && indicators.fib.levels) {
    const colors = { 'L0.0': '#64748b', 'L23.6': '#3b82f6', 'L38.2': '#8b5cf6', 'L50.0': '#eab308', 'L61.8': '#f97316', 'L78.6': '#ec4899', 'L100.0': '#64748b' };
    Object.entries(indicators.fib.levels).forEach(([lvl, price]) => {
      const line = candleSeries.createPriceLine({ price, color: colors[lvl] || '#9ca3af', lineWidth: 1, lineStyle: 3, title: `Fib ${lvl.replace('L', '')}%` });
      state.charts.priceLines.push(line);
    });
  }

  // Fit content
  state.charts.priceChart.timeScale().fitContent();
}

// Calculate and Rank Trending Stocks using FastAPI
async function scanMarket() {
  state.isLoading = true;
  document.getElementById('scanner-loading-indicator').classList.remove('hidden');
  document.getElementById('trending-table-body').classList.add('opacity-40');
  
  try {
    const response = await fetch(`${API_BASE}/api/movers/active`);
    if (!response.ok) throw new Error("API Error");
    const json = await response.json();
    if (json.status === 'cache_warming') {
      throw new Error(json.message);
    }
    // Lightweight movers — just ticker, price, pctChange, volume
    const results = (json.movers || []).map(s => ({
      ticker:         s.ticker,
      name:           TICKER_NAMES[s.ticker] || s.ticker.replace('.JK', ''),
      price:          s.price,
      pctChange:      s.pctChange,
      volume:         s.volume,
      volumeRatio:    1,          // will be populated after full load
      recommendation: '--',
      badgeClass:     'badge-neutral',
      report:         null,       // loaded on-demand
      data:           null,
      indicators:     null,
      meta:           null,
    }));

    state.trendingList = results;
    state.stocksData = results.reduce((acc, curr) => {
      acc[curr.ticker] = curr;
      return acc;
    }, {});

    if (results.length > 0) {
      state.activeTicker = results[0].ticker;
    }
  } catch (e) {
    console.error(`Error scanning market:`, e);
    const errorEl = document.getElementById('search-error');
    if (errorEl) {
      const safeMsg = escapeHTML(e.message || 'Network Error: Could not fetch market data. Please make sure the Python backend is running on port 18080.');
      errorEl.innerHTML = `<div class="bg-rose-500/15 border border-rose-500/30 text-rose-400 px-4 py-3 rounded-xl text-sm flex items-center space-x-3">
        <i data-lucide="alert-circle" class="w-5 h-5 flex-shrink-0"></i>
        <span>${safeMsg}</span>
      </div>`;
      errorEl.classList.remove('hidden');
      lucide.createIcons();
    }
  }

  state.isLoading = false;
  document.getElementById('scanner-loading-indicator').classList.add('hidden');
  document.getElementById('trending-table-body').classList.remove('opacity-40');

  if (state.trendingList.length > 0) {
    renderTrendingList();
    selectTicker(state.activeTicker);
  }
}

// Render stock header & corporate details panel
function renderHeaderDetails(ticker, stock, r) {
  document.getElementById('detail-ticker-name').innerText = ticker;
  document.getElementById('detail-company-name').innerText = stock.name;

  // Render Listing Board (Category) Badge
  const rawCode = ticker.replace('.JK', '');
  const idxMatch = fullIdxList.find(item => item.Code === rawCode);
  const boardEl = document.getElementById('detail-board-badge');
  if (boardEl) {
    if (idxMatch && idxMatch.ListingBoard) {
      boardEl.innerText = `${idxMatch.ListingBoard} Board`;
      boardEl.classList.remove('hidden');
      
      // Dynamic colors based on board category
      boardEl.className = "px-2 py-0.5 rounded text-[10px] font-bold uppercase border " + 
        (idxMatch.ListingBoard === 'Utama' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : 
         idxMatch.ListingBoard === 'Pengembangan' ? 'bg-sky-500/10 text-sky-400 border-sky-500/20' : 
         idxMatch.ListingBoard === 'Akselerasi' ? 'bg-teal-500/10 text-teal-400 border-teal-500/20' : 
         'bg-rose-500/10 text-rose-400 border-rose-500/20'); // Pemantauan Khusus
    } else {
      boardEl.classList.add('hidden');
    }
  }
  
  // Yahoo Meta Data
  if (stock.meta) {
    document.getElementById('detail-52w-high').innerText = stock.meta.fiftyTwoWeekHigh ? `Rp ${stock.meta.fiftyTwoWeekHigh.toLocaleString('id-ID')}` : '--';
    document.getElementById('detail-52w-low').innerText = stock.meta.fiftyTwoWeekLow ? `Rp ${stock.meta.fiftyTwoWeekLow.toLocaleString('id-ID')}` : '--';
    document.getElementById('detail-volume').innerText = stock.meta.regularMarketVolume ? stock.meta.regularMarketVolume.toLocaleString('id-ID') : '--';
    document.getElementById('detail-yahoo-link').href = `https://finance.yahoo.com/quote/${ticker.trim()}/`;
    
    if (stock.meta.longName) {
      document.getElementById('detail-company-name').innerText = stock.meta.longName;
    }
  } else {
    document.getElementById('detail-yahoo-link').href = `https://finance.yahoo.com/quote/${ticker.trim()}/`;
    document.getElementById('detail-52w-high').innerText = '--';
    document.getElementById('detail-52w-low').innerText = '--';
    document.getElementById('detail-volume').innerText = '--';
  }
  
  const priceEl = document.getElementById('detail-price');
  priceEl.innerText = `Rp ${r.latestPrice.toLocaleString('id-ID')}`;
  
  const changeEl = document.getElementById('detail-change');
  const sign = r.priceChange >= 0 ? '+' : '';
  changeEl.innerText = `${sign}${r.priceChange.toLocaleString('id-ID')} (${sign}${r.pctChange.toFixed(2)}%)`;
  
  if (r.priceChange >= 0) {
    changeEl.className = 'text-sm font-semibold text-emerald-500 glow-text-green';
  } else {
    changeEl.className = 'text-sm font-semibold text-rose-500 glow-text-red';
  }

  // Summary recommendation badge
  const recBadge = document.getElementById('detail-recommendation-badge');
  recBadge.innerText = r.recommendation;
  recBadge.className = `px-3 py-1 rounded-full text-xs font-bold ${r.badgeClass}`;

  // Summary comment
  document.getElementById('analyst-summary-comment').innerText = r.analysisComment;
}

// Render trading plan section
function renderTradingPlanDetails(r) {
  if (r.tradingPlan) {
    document.getElementById('plan-entry').innerText = r.tradingPlan.entry;
    document.getElementById('plan-tp').innerText = r.tradingPlan.tp;
    document.getElementById('plan-sl').innerText = r.tradingPlan.sl;
    document.getElementById('plan-support').innerText = r.tradingPlan.support;
    document.getElementById('plan-resistance').innerText = r.tradingPlan.resistance;
  }
}

// Render dynamic indicators table
function renderIndicatorsDetails(r) {
  document.getElementById('indicator-rsi-val').innerText = r.rsi.toFixed(2);
  document.getElementById('indicator-rsi-signal').innerText = r.rsiSignal;
  document.getElementById('indicator-rsi-signal').className = `text-right font-medium ${
    r.rsiSignal === 'Oversold' ? 'text-emerald-500' : r.rsiSignal === 'Overbought' ? 'text-rose-500' : 'text-amber-500'
  }`;

  document.getElementById('indicator-macd-val').innerText = r.macd.toFixed(2);
  document.getElementById('indicator-macd-signal').innerText = r.macdSignal;
  document.getElementById('indicator-macd-signal').className = `text-right font-medium ${
    r.macdSignal.includes('Bullish') ? 'text-emerald-500' : 'text-rose-500'
  }`;

  document.getElementById('indicator-ema-val').innerText = `Rp ${r.ema50.toLocaleString('id-ID', {maximumFractionDigits:0})}`;
  document.getElementById('indicator-ema-signal').innerText = r.emaSignal;
  document.getElementById('indicator-ema-signal').className = `text-right font-medium ${
    r.emaSignal.includes('Bullish') || r.emaSignal.includes('Uptrend') ? 'text-emerald-500' : 'text-rose-500'
  }`;

  document.getElementById('indicator-sr-val').innerText = `${r.sr.support ? r.sr.support.toLocaleString('id-ID') : '--'} / ${r.sr.resistance ? r.sr.resistance.toLocaleString('id-ID') : '--'}`;
  document.getElementById('indicator-sr-signal').innerText = r.srSignal;
  document.getElementById('indicator-sr-signal').className = `text-right font-medium ${
    r.srSignal === 'At Support' ? 'text-emerald-500' : r.srSignal === 'At Resistance' ? 'text-rose-500' : 'text-amber-500'
  }`;

  document.getElementById('indicator-vol-val').innerText = `${r.vol.ratio ? r.vol.ratio.toFixed(2) + 'x' : '--'}`;
  document.getElementById('indicator-vol-signal').innerText = r.volSignal;
  document.getElementById('indicator-vol-signal').className = `text-right font-medium ${
    r.volSignal.includes('High') || r.volSignal === 'Extremely High Vol' ? 'text-emerald-500' : r.volSignal === 'Low Volume' ? 'text-gray-400' : 'text-amber-500'
  }`;

  document.getElementById('indicator-fib-val').innerText = r.fibSignal.includes('Near') ? r.fibSignal.split('(')[0].trim() : '--';
  document.getElementById('indicator-fib-signal').innerText = r.fibSignal;
  document.getElementById('indicator-fib-signal').className = `text-right font-medium ${
    r.fibSignal.includes('Near') ? 'text-emerald-500' : 'text-gray-400'
  }`;

  document.getElementById('indicator-stoch-val').innerText = `${r.stoch.k ? r.stoch.k.toFixed(1) : '--'} / ${r.stoch.d ? r.stoch.d.toFixed(1) : '--'}`;
  document.getElementById('indicator-stoch-signal').innerText = r.stochSignal;
  document.getElementById('indicator-stoch-signal').className = `text-right font-medium ${
    r.stochSignal.includes('Bullish') ? 'text-emerald-500' : r.stochSignal.includes('Bearish') ? 'text-rose-500' : r.stochSignal === 'Oversold' ? 'text-emerald-500' : r.stochSignal === 'Overbought' ? 'text-rose-500' : 'text-amber-500'
  }`;
}

// Render stock details UI panels (modular caller)
function renderDetails(ticker) {
  const stock = state.stocksData[ticker];
  if (!stock) return;

  const r = stock.report;
  
  renderHeaderDetails(ticker, stock, r);
  renderTradingPlanDetails(r);
  renderIndicatorsDetails(r);
  updateWatchlistButtonState(ticker);

  // Update chart elements
  updateCharts(stock.data, stock.indicators);
}

// Select stock and update dashboard
async function selectTicker(ticker) {
  state.activeTicker = ticker;

  // Highlight active row in trending list
  const rows = document.querySelectorAll('#trending-table-body tr');
  rows.forEach(row => {
    if (row.getAttribute('data-ticker') === ticker) {
      row.classList.add('bg-blue-600/10', 'border-blue-500/30');
    } else {
      row.classList.remove('bg-blue-600/10', 'border-blue-500/30');
    }
  });

  let stock = state.stocksData[ticker];

  // If this is a lightweight movers entry (no full report), fetch on-demand
  if (!stock || !stock.report) {
    // Show loading state in detail panel
    const priceEl = document.getElementById('detail-price');
    const nameEl  = document.getElementById('detail-company-name');
    const tickEl  = document.getElementById('detail-ticker-name');
    if (tickEl)  tickEl.innerText  = ticker.replace('.JK', '');
    if (nameEl)  nameEl.innerText  = 'Loading analysis...';
    if (priceEl) priceEl.innerText = '...';

    try {
      const stockInfo = await fetchTickerData(ticker, state.activeRange);
      if (!stockInfo || !stockInfo.report) throw new Error('No report returned');

      // Merge full data into state
      state.stocksData[ticker] = {
        ...(stock || {}),
        ticker:         stockInfo.ticker,
        name:           stockInfo.meta?.longName || TICKER_NAMES[ticker] || ticker.replace('.JK', ''),
        price:          stockInfo.report.latestPrice,
        pctChange:      stockInfo.report.pctChange,
        volumeRatio:    stockInfo.report.vol?.ratio ?? 1,
        recommendation: stockInfo.report.recommendation,
        badgeClass:     stockInfo.report.badgeClass,
        report:         stockInfo.report,
        data:           stockInfo.data,
        indicators:     stockInfo.indicators,
        meta:           stockInfo.meta,
      };

      // Update the row in the trending table with real badge
      const activeRow = document.querySelector(`#trending-table-body tr[data-ticker="${ticker}"]`);
      if (activeRow) {
        const badgeCell = activeRow.querySelector('td:last-child span');
        if (badgeCell) {
          badgeCell.innerText  = stockInfo.report.recommendation;
          badgeCell.className  = `inline-block px-2 py-0.5 rounded text-[10px] font-bold ${stockInfo.report.badgeClass}`;
        }
      }

      stock = state.stocksData[ticker];
    } catch (e) {
      console.error(`Failed to load full data for ${ticker}:`, e);
      if (nameEl) nameEl.innerText = `Could not load ${ticker}. ${e.message}`;
      return;
    }
  }

  renderDetails(ticker);
}

// Render Trending list rows in the table
function renderTrendingList() {
  const tbody = document.getElementById('trending-table-body');
  tbody.innerHTML = '';

  const type = state.activeMoversType;

  state.trendingList.forEach((stock, index) => {
    const tr = document.createElement('tr');
    tr.className = 'border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors duration-200';
    tr.setAttribute('data-ticker', stock.ticker);

    const priceChangeSign  = stock.pctChange >= 0 ? '+' : '';
    const priceChangeColor = stock.pctChange >= 0 ? 'text-emerald-500' : 'text-rose-500';

    // Sort metric cell — shows the key that determined rank
    let sortCell = '';
    if (type === 'gainers' || type === 'losers') {
      sortCell = `<td class="px-4 py-3 text-right font-bold text-sm ${priceChangeColor}">${priceChangeSign}${stock.pctChange.toFixed(2)}%</td>`;
    } else if (type === 'active') {
      const vol = stock.volume ?? stock.report?.vol?.latestVol ?? 0;
      sortCell = `<td class="px-4 py-3 text-right font-bold text-sm text-blue-400">${vol > 0 ? (vol / 1_000_000).toFixed(1) + 'M' : '--'}</td>`;
    } else if (type === 'dividend') {
      sortCell = `<td class="px-4 py-3 text-right font-bold text-sm text-amber-400">${priceChangeSign}${stock.pctChange.toFixed(2)}%</td>`;
    } else {
      // Default fallback cell to keep the columns aligned (e.g. for Watchlist or custom searches)
      sortCell = `<td class="px-4 py-3 text-right font-bold text-sm ${priceChangeColor}">${priceChangeSign}${stock.pctChange.toFixed(2)}%</td>`;
    }

    tr.innerHTML = `
      <td class="px-4 py-3 font-semibold text-sm text-gray-500">#${index + 1}</td>
      <td class="px-4 py-3">
        <div class="font-bold text-white text-sm">${stock.ticker.replace('.JK', '')}</div>
        <div class="text-[10px] text-gray-400 truncate max-w-[120px]">${stock.name}</div>
      </td>
      <td class="px-4 py-3 font-medium text-right text-sm">Rp ${Math.round(stock.price).toLocaleString('id-ID')}</td>
      ${sortCell}
      <td class="px-4 py-3 text-right text-sm">
        <div class="font-semibold text-gray-300">${(stock.volumeRatio ?? 1).toFixed(1)}x</div>
        <div class="text-[9px] text-gray-400">vs 20d avg</div>
      </td>
      <td class="px-4 py-3 text-right">
        <span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold ${stock.badgeClass}">${stock.recommendation}</span>
      </td>
    `;

    // Accessibility properties for table rows acting as select buttons
    tr.tabIndex = 0;
    tr.setAttribute('role', 'button');
    tr.setAttribute('aria-label', `View analysis for ${stock.ticker.replace('.JK', '')}`);

    const triggerSelect = () => selectTicker(stock.ticker);
    tr.addEventListener('click', triggerSelect);
    tr.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        triggerSelect();
      }
    });

    tbody.appendChild(tr);
  });
}

// Handle Custom Ticker Searches
async function searchTicker(searchVal) {
  let ticker = searchVal.toUpperCase().trim();
  const rawCode = ticker.replace('.JK', '');

  // Validate against IDX list strictly
  if (!fullIdxList || fullIdxList.length === 0) {
    const errorEl = document.getElementById('search-error');
    errorEl.innerText = `IDX Ticker list is still loading or unavailable. Please wait and try again.`;
    errorEl.classList.remove('hidden');
    return;
  }

  const isValid = fullIdxList.some(item => item.Code.toUpperCase() === rawCode);
  if (!isValid) {
    const errorEl = document.getElementById('search-error');
    errorEl.innerText = `Ticker "${rawCode}" is not listed in the IDX.`;
    errorEl.classList.remove('hidden');
    return;
  }

  if (!ticker.endsWith('.JK') && !ticker.includes('.')) {
    ticker += '.JK';
  }

  document.getElementById('search-error').classList.add('hidden');
  const overlay = document.getElementById('page-loading-overlay');
  if (overlay) overlay.classList.remove('hidden');

  try {
    const stockInfo = await fetchTickerData(ticker);
    if (!stockInfo || !stockInfo.data || stockInfo.data.length === 0) {
      throw new Error("No data found");
    }

    const data = stockInfo.data;
    const indicators = stockInfo.indicators;
    const report = stockInfo.report;

    // Make sure name exists
    if (!TICKER_NAMES[ticker]) {
      TICKER_NAMES[ticker] = ticker.replace('.JK', '') + ' Stock';
    }

    // Insert into state.stocksData and activeTicker
    state.stocksData[ticker] = {
      ticker,
      name: TICKER_NAMES[ticker],
      price: report.latestPrice,
      pctChange: report.pctChange,
      volumeRatio: 1.2, // Default estimated ratio for searched item
      newsInterest: 50,
      trendScore: Math.abs(report.pctChange) + 1.2,
      recommendation: report.recommendation,
      badgeClass: report.badgeClass,
      report,
      data,
      indicators,
      meta: stockInfo.meta
    };

    // Prepend to trending list if not already in it
    if (!state.trendingList.some(item => item.ticker === ticker)) {
      state.trendingList.unshift(state.stocksData[ticker]);
      renderTrendingList();
    }

    selectTicker(ticker);
  } catch (e) {
    console.error("Search error:", e);
    const errorEl = document.getElementById('search-error');
    errorEl.innerText = `Could not load ticker "${ticker}". Check spelling or try again.`;
    errorEl.classList.remove('hidden');
  } finally {
    const overlay = document.getElementById('page-loading-overlay');
    if (overlay) overlay.classList.add('hidden');
  }
}

// Autocomplete & Ticker List State
let fullIdxList = [];

async function loadIdxList() {
  if (typeof IDX_TICKERS !== 'undefined' && Array.isArray(IDX_TICKERS)) {
    fullIdxList = IDX_TICKERS;
    setTimeout(() => document.dispatchEvent(new Event('idxListLoaded')), 50);
    return;
  }
  
  try {
    const localRes = await fetch('idx_tickers.json');
    if (localRes.ok) {
      const json = await localRes.json();
      fullIdxList = json.data ? json.data : json;
      setTimeout(() => document.dispatchEvent(new Event('idxListLoaded')), 50);
      return;
    }
  } catch (e) {
    // File not found or CORS blocked (file:// protocol), fall back to live API
  }

  const cached = localStorage.getItem('idx_tickers_cache');
  const cacheTime = localStorage.getItem('idx_tickers_time');
  const now = Date.now();

  if (cached && cacheTime && now - parseInt(cacheTime) < 86400000) {
    try {
      fullIdxList = JSON.parse(cached);
      setTimeout(() => document.dispatchEvent(new Event('idxListLoaded')), 100);
      return;
    } catch (e) {
      console.warn("Invalid cache", e);
    }
  }

  try {
    let res = await fetch('https://www.idx.co.id/primary/StockData/GetSecuritiesStock');
    let json = null;
    
    if (res.ok) {
      json = await res.json();
    } else {
      console.warn("Direct IDX fetch failed, trying proxy...");
      res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent('https://www.idx.co.id/primary/StockData/GetSecuritiesStock')}`);
      if (res.ok) {
        const proxyData = await res.json();
        json = JSON.parse(proxyData.contents);
      }
    }

    if (json && json.data) {
      fullIdxList = json.data;
      localStorage.setItem('idx_tickers_cache', JSON.stringify(fullIdxList));
      localStorage.setItem('idx_tickers_time', now.toString());
      document.dispatchEvent(new Event('idxListLoaded'));
    } else {
      throw new Error("Invalid JSON format from IDX");
    }
  } catch (e) {
    console.error("Could not load dynamic IDX list", e);
    if (cached) {
      fullIdxList = JSON.parse(cached);
      document.dispatchEvent(new Event('idxListLoaded'));
    } else {
      document.dispatchEvent(new Event('idxListFailed'));
    }
  }
}

// Bootstrapper
document.addEventListener('DOMContentLoaded', () => {
  initCharts();
  scanMarket();
  loadIdxList();

  // Command Palette / Modal Search Logic
  const searchModal = document.getElementById('search-modal');
  const searchModalBackdrop = document.getElementById('search-modal-backdrop');
  const openSearchBtn = document.getElementById('open-search-modal-btn');
  const modalSearchInput = document.getElementById('modal-search-input');
  const modalSearchResults = document.getElementById('modal-search-results');

  let activeSearchIndex = -1;
  let currentMatches = [];

  function getRecentSearches() {
    try {
      const stored = localStorage.getItem('recent_searches');
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  }

  function addRecentSearch(tickerCode, name) {
    try {
      let recent = getRecentSearches();
      recent = recent.filter(item => item.Code !== tickerCode);
      recent.unshift({ Code: tickerCode, Name: name });
      recent = recent.slice(0, 5); // Keep top 5
      localStorage.setItem('recent_searches', JSON.stringify(recent));
    } catch (e) {
      console.warn("Could not save recent search", e);
    }
  }

  function highlightText(text, query) {
    if (!text) return '';
    const escapedText = escapeHTML(text);
    if (!query) return escapedText;
    const escapedQuery = escapeHTML(query).replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const reg = new RegExp(`(${escapedQuery})`, 'gi');
    return escapedText.replace(reg, '<mark class="bg-blue-500/40 text-blue-200 rounded px-0.5">$1</mark>');
  }

  function openSearchModal() {
    searchModal.classList.remove('hidden');
    modalSearchInput.value = '';
    activeSearchIndex = -1;
    if (openSearchBtn) openSearchBtn.setAttribute('aria-expanded', 'true');
    
    const recent = getRecentSearches();
    if (recent.length > 0) {
      currentMatches = recent;
      renderModalList(recent, '', true);
    } else {
      currentMatches = fullIdxList.slice(0, 50);
      renderModalList(currentMatches, '');
    }
    setTimeout(() => modalSearchInput.focus(), 50);
  }

  function closeSearchModal() {
    searchModal.classList.add('hidden');
    if (openSearchBtn) openSearchBtn.setAttribute('aria-expanded', 'false');
  }

  if (openSearchBtn) {
    openSearchBtn.addEventListener('click', openSearchModal);
  }
  
  if (searchModalBackdrop) {
    searchModalBackdrop.addEventListener('click', closeSearchModal);
  }

  document.addEventListener('keydown', (e) => {
    // Ctrl+K or Cmd+K to open
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      openSearchModal();
    }
    // Escape to close
    if (e.key === 'Escape' && !searchModal.classList.contains('hidden')) {
      closeSearchModal();
    }
  });

  document.addEventListener('idxListLoaded', () => {
    if (searchModal && !searchModal.classList.contains('hidden')) {
      const val = modalSearchInput.value.toUpperCase();
      if (!val) {
        const recent = getRecentSearches();
        if (recent.length > 0) {
          currentMatches = recent;
          renderModalList(recent, '', true);
        } else {
          currentMatches = fullIdxList.slice(0, 50);
          renderModalList(currentMatches, '');
        }
      } else {
        const matches = fullIdxList.filter(item => 
          item.Code.toUpperCase().includes(val) || 
          (item.Name && item.Name.toUpperCase().includes(val))
        ).slice(0, 50);
        currentMatches = matches;
        renderModalList(matches, val);
      }
    }
  });

  document.addEventListener('idxListFailed', () => {
    if (searchModal && !searchModal.classList.contains('hidden')) {
      modalSearchResults.innerHTML = '<li class="px-6 py-8 text-center text-rose-500">Failed to load IDX Ticker list. Please check your connection.</li>';
    }
  });

  function renderModalList(matches, query = '', isRecent = false) {
    modalSearchResults.innerHTML = '';
    activeSearchIndex = -1;
    
    if (fullIdxList.length === 0) {
      modalSearchResults.innerHTML = `
        <li class="px-6 py-10 text-center text-gray-400 flex flex-col items-center justify-center space-y-4">
          <div class="animate-spin rounded-full h-6 w-6 border-2 border-t-transparent border-blue-500"></div>
          <span>Loading IDX Tickers... Please wait a moment.</span>
        </li>
      `;
      return;
    }

    if (isRecent && matches.length > 0) {
      const header = document.createElement('li');
      header.className = 'px-6 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider bg-white/2';
      header.innerHTML = '<span class="flex items-center space-x-1.5"><i data-lucide="clock" class="w-3.5 h-3.5"></i><span>Recent Searches</span></span>';
      modalSearchResults.appendChild(header);
    }

    if (matches.length > 0) {
      matches.forEach((match, index) => {
        const li = document.createElement('li');
        li.className = 'px-6 py-3 hover:bg-gray-800/60 cursor-pointer flex justify-between items-center border-b border-white/5 transition-all duration-150 group search-result-item';
        li.setAttribute('data-index', index);
        li.innerHTML = `
          <div class="flex items-center space-x-3">
            <div class="bg-gray-700/50 rounded-lg p-2 group-hover:bg-blue-600/20 transition-colors shrink-to-fit-icon">
              <i data-lucide="${isRecent ? 'clock' : 'trending-up'}" class="w-4 h-4 text-gray-400 group-hover:text-blue-400 transition-colors"></i>
            </div>
            <div>
              <div class="font-bold text-white text-base">${highlightText(match.Code, query)}</div>
              <div class="text-xs text-gray-400">${highlightText(match.Name, query)}</div>
            </div>
          </div>
          <div class="text-[9px] uppercase font-bold px-2 py-0.5 rounded border ${
            match.ListingBoard === 'Utama' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : 
            match.ListingBoard === 'Pengembangan' ? 'bg-sky-500/10 text-sky-400 border-sky-500/20' : 
            match.ListingBoard === 'Akselerasi' ? 'bg-teal-500/10 text-teal-400 border-teal-500/20' : 
            'bg-rose-500/10 text-rose-400 border-rose-500/20'
          }">${match.ListingBoard || 'IDX'}</div>
        `;
        li.addEventListener('click', () => {
          closeSearchModal();
          addRecentSearch(match.Code, match.Name);
          searchTicker(match.Code);
        });
        modalSearchResults.appendChild(li);
      });
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
    } else {
      modalSearchResults.innerHTML = `
        <li class="px-6 py-10 text-center text-gray-500 flex flex-col items-center justify-center space-y-2">
          <i data-lucide="alert-circle" class="w-8 h-8 text-gray-600 mb-2"></i>
          <span class="font-semibold text-gray-400">No stocks found matching "${query}"</span>
          <span class="text-xs text-gray-600">Double check spelling or try a different symbol</span>
        </li>
      `;
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  }

  function updateActiveSearchItem() {
    const items = modalSearchResults.querySelectorAll('.search-result-item');
    items.forEach((item, idx) => {
      if (idx === activeSearchIndex) {
        item.classList.add('bg-blue-600/20', 'border-l-4', 'border-l-blue-500', 'pl-5');
        item.classList.remove('pl-6');
        item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        item.classList.remove('bg-blue-600/20', 'border-l-4', 'border-l-blue-500', 'pl-5');
        item.classList.add('pl-6');
      }
    });
  }

  if (modalSearchInput) {
    modalSearchInput.addEventListener('input', (e) => {
      const val = e.target.value.toUpperCase();
      activeSearchIndex = -1;
      
      if (!val) {
        const recent = getRecentSearches();
        if (recent.length > 0) {
          currentMatches = recent;
          renderModalList(recent, '', true);
        } else {
          currentMatches = fullIdxList.slice(0, 50);
          renderModalList(currentMatches, '');
        }
        return;
      }
      
      const matches = fullIdxList.filter(item => 
        item.Code.toUpperCase().includes(val) || 
        (item.Name && item.Name.toUpperCase().includes(val))
      ).slice(0, 50);
      
      currentMatches = matches;
      renderModalList(matches, val);
    });
    
    modalSearchInput.addEventListener('keydown', (e) => {
      const items = modalSearchResults.querySelectorAll('.search-result-item');
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (items.length > 0) {
          activeSearchIndex = (activeSearchIndex + 1) % items.length;
          updateActiveSearchItem();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (items.length > 0) {
          activeSearchIndex = activeSearchIndex <= 0 ? items.length - 1 : activeSearchIndex - 1;
          updateActiveSearchItem();
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (activeSearchIndex >= 0 && activeSearchIndex < currentMatches.length) {
          const selected = currentMatches[activeSearchIndex];
          closeSearchModal();
          addRecentSearch(selected.Code, selected.Name);
          searchTicker(selected.Code);
        } else if (modalSearchInput.value) {
          const val = modalSearchInput.value.toUpperCase().trim();
          const match = fullIdxList.find(item => item.Code.toUpperCase() === val);
          closeSearchModal();
          if (match) {
            addRecentSearch(match.Code, match.Name);
            searchTicker(match.Code);
          } else {
            searchTicker(val);
          }
        }
      }
    });
  }

  // Hot Watchlist Quick Links
  const quickLinks = document.querySelectorAll('.quick-link-btn');
  quickLinks.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const ticker = e.currentTarget.getAttribute('data-ticker');
      selectTicker(ticker);
    });
  });

  // Range Selector — reload current ticker with new time period from backend
  const rangeBtns = document.querySelectorAll('.range-btn');
  rangeBtns.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const newRange = e.currentTarget.getAttribute('data-range');
      if (!newRange || newRange === state.activeRange) return;

      // Update active-tab styling
      rangeBtns.forEach(b => b.classList.remove('active-tab'));
      e.currentTarget.classList.add('active-tab');
      state.activeRange = newRange;

      const ticker = state.activeTicker;
      if (!ticker) return;

      // Show loading state in chart area
      const priceEl = document.getElementById('detail-price');
      if (priceEl) priceEl.style.opacity = '0.4';

      try {
        const stockInfo = await fetchTickerData(ticker, newRange);
        if (!stockInfo || !stockInfo.data || !stockInfo.report) return;

        // Update full data in state
        state.stocksData[ticker] = {
          ...(state.stocksData[ticker] || {}),
          data:           stockInfo.data,
          indicators:     stockInfo.indicators,
          report:         stockInfo.report,
          meta:           stockInfo.meta,
          price:          stockInfo.report.latestPrice,
          pctChange:      stockInfo.report.pctChange,
          volumeRatio:    stockInfo.report.vol?.ratio ?? 1,
          recommendation: stockInfo.report.recommendation,
          badgeClass:     stockInfo.report.badgeClass,
        };

        renderDetails(ticker);
      } catch (err) {
        console.error("Error updating range:", err);
      } finally {
        if (priceEl) priceEl.style.opacity = '1';
      }
    });
  });

  // Documentation Modal Logic
  const openDocsBtn = document.getElementById('open-docs-modal-btn');
  const closeDocsBtn = document.getElementById('close-docs-modal-btn');
  const docsModal = document.getElementById('docs-modal');
  const docsBackdrop = document.getElementById('docs-modal-backdrop');

  if (openDocsBtn && docsModal) {
    const openDocs = () => {
      docsModal.classList.remove('hidden');
      document.body.style.overflow = 'hidden'; 
      openDocsBtn.setAttribute('aria-expanded', 'true');
    };
    
    const closeDocs = () => {
      docsModal.classList.add('hidden');
      document.body.style.overflow = '';
      openDocsBtn.setAttribute('aria-expanded', 'false');
    };

    openDocsBtn.addEventListener('click', openDocs);
    if (closeDocsBtn) closeDocsBtn.addEventListener('click', closeDocs);
    if (docsBackdrop) docsBackdrop.addEventListener('click', closeDocs);

    // Tab Switching Logic
    const tabBtns = document.querySelectorAll('.docs-tab-btn');
    const tabContents = document.querySelectorAll('.docs-tab-content');

    tabBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        // Reset buttons
        tabBtns.forEach(b => {
          b.classList.remove('active', 'text-indigo-400', 'border-indigo-500');
          b.classList.add('text-gray-500', 'border-transparent');
        });
        // Set active button
        e.currentTarget.classList.remove('text-gray-500', 'border-transparent');
        e.currentTarget.classList.add('active', 'text-indigo-400', 'border-indigo-500');

        // Hide all contents
        tabContents.forEach(content => content.classList.add('hidden'));
        
        // Show target content
        const targetId = e.currentTarget.getAttribute('data-target');
        const targetContent = document.getElementById(targetId);
        if (targetContent) {
          targetContent.classList.remove('hidden');
        }
      });
    });
  }

  // Live Market Movers Logic via FastAPI
  const moverBtns = document.querySelectorAll('.market-mover-btn');
  moverBtns.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const type = e.currentTarget.getAttribute('data-list');
      const labelText = e.currentTarget.innerText.trim();
      
      const tableTitle = document.getElementById('trending-table-title');
      if (tableTitle) {
        tableTitle.innerText = `Market Movers: ${labelText}`;
      }

      if (type === 'watchlist') {
        loadWatchlistTab();
        return;
      }

      document.getElementById('scanner-loading-indicator').classList.remove('hidden');
      document.getElementById('trending-table-body').classList.add('opacity-40');
      document.getElementById('trending-table-body').innerHTML = `
        <tr>
          <td colspan="6" class="px-4 py-8 text-center text-gray-500 text-sm">
            <div class="flex flex-col items-center justify-center space-y-3">
              <div class="animate-spin rounded-full h-8 w-8 border-2 border-t-transparent border-blue-500"></div>
              <span>Fetching ${labelText} from backend... Please wait.</span>
            </div>
          </td>
        </tr>
      `;

      try {
        state.activeMoversType = type;
        const response = await fetch(`${API_BASE}/api/movers/${type}`);
        if (!response.ok) throw new Error("API Error");
        const json = await response.json();

        if (json.status === 'cache_warming') {
          document.getElementById('trending-table-body').innerHTML = `
            <tr><td colspan="6" class="px-4 py-8 text-center text-amber-400">${json.message}</td></tr>
          `;
          document.getElementById('scanner-loading-indicator').classList.add('hidden');
          return;
        }

        // Map lightweight movers format
        const results = (json.movers || []).map(s => ({
          ticker:         s.ticker,
          name:           TICKER_NAMES[s.ticker] || s.ticker.replace('.JK', ''),
          price:          s.price,
          pctChange:      s.pctChange,
          volume:         s.volume,
          volumeRatio:    1,
          recommendation: '--',
          badgeClass:     'badge-neutral',
          report:         null,
          data:           null,
          indicators:     null,
          meta:           null,
        }));

        // Update state and render
        state.trendingList = results;
        results.forEach(curr => { state.stocksData[curr.ticker] = curr; });

        document.getElementById('scanner-loading-indicator').classList.add('hidden');
        document.getElementById('trending-table-body').classList.remove('opacity-40');
        renderTrendingList();
        document.getElementById('trending-table-body').scrollIntoView({ behavior: 'smooth', block: 'center' });

      } catch (err) {
        console.error("Scanner failed", err);
        document.getElementById('scanner-loading-indicator').classList.add('hidden');
        const safeErrMsg = escapeHTML(err.message);
        document.getElementById('trending-table-body').innerHTML = `
          <tr><td colspan="6" class="px-4 py-8 text-center text-rose-500">Scan failed: ${safeErrMsg}</td></tr>
        `;
      }
    });
  });

  // Watchlist save button listener
  const saveWatchlistBtn = document.getElementById('save-watchlist-btn');
  if (saveWatchlistBtn) {
    saveWatchlistBtn.addEventListener('click', () => {
      const ticker = state.activeTicker;
      if (ticker) {
        toggleWatchlist(ticker);
        // Refresh dynamic table if we are currently looking at our Watchlist tab
        if (state.activeMoversType === 'watchlist') {
          loadWatchlistTab();
        }
      }
    });
  }
});
