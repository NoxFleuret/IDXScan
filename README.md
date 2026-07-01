# IDXScan 📈

> **IDXScan** is a real-time stock technical analysis dashboard and scanner designed for the Indonesia Stock Exchange (IDX). Built with a FastAPI backend and a high-performance static frontend utilizing TradingView charts.

---

## ✨ Features

- **Live Market Movers**: Real-time scanner for **Top Gainers**, **Top Losers**, **Most Active**, and **High Dividend** yields.
- **Dynamic Watchlist Bookmark**: Save tickers to your personal Watchlist (persisted locally).
- **TradingView Charts**: Embedded interactive stock price charts plotting indicators (EMA, Fibonacci Retracement Levels).
- **Advanced Technical Indicators**: Computes RSI, MACD, Stochastic Oscillator, Support/Resistance, and ATR bounds.
- **Listing Board Badges**: Displays listing category indicators (`Utama`, `Pengembangan`, `Akselerasi`, `Pemantauan Khusus`).
- **Command Palette Search**: Fully keyboard-accessible (`Ctrl+K`) query autocomplete search with search history.
- **High Performance**: Optimized static assets, debounced mobile resize handlers, and parallel data fetching.

---

## 🚀 Setup & Execution

### 1. Prerequisites
- **Python 3.10+** (Python 3.11 or 3.12 recommended for optimal typing and thread execution).
- **Pip** (Python package installer).

#### Python Package Dependency Details
The application requires the following packages (specified in `backend/requirements.txt`):

| Package | Recommended Version | Role / Purpose |
| :--- | :--- | :--- |
| **`fastapi`** | `^0.100.0` | Light, fast web framework for backend endpoints. |
| **`uvicorn`** | `^0.22.0` | ASGI server execution engine. |
| **`yfinance`** | `^0.2.30` | Connects and downloads stock ticker quotes and historical candles. |
| **`pandas`** | `^2.0.0` | Dataframe engine for technical calculations. |
| **`numpy`** | `^1.24.0` | Numerical calculations, handling matrix cleanups and serialization. |
| **`pandas-ta`** | `^0.3.14b` | Tech analysis library (EMA, RSI, MACD, Stochastics). |
| **`cachetools`** | `^5.3.0` | Memory-efficient cache logic holding gainer/loser pools. |
| **`requests`** | `^2.31.0` | Fetches JSON securities list index from IDX endpoints. |

### 2. Manual / First-Time Installation
If you are setting up the project from scratch, follow these commands in your terminal:

```bash
# 1. Clone or navigate to the project directory
cd IDXScan

# 2. Create the Python virtual environment
python -m venv backend/venv

# 3. Activate the virtual environment
# On Windows (PowerShell):
.\backend\venv\Scripts\Activate.ps1
# On Windows (CMD):
.\backend\venv\Scripts\activate.bat
# On macOS/Linux:
source backend/venv/bin/activate

# 4. Install backend dependencies (using the requirements file)
pip install -r backend/requirements.txt

# Or install packages individually:
pip install fastapi uvicorn yfinance pandas numpy pandas-ta cachetools requests
```

### 3. Execution

#### On Windows (Quick Start)
Once the environment and dependencies are configured, you can launch the app by double-clicking the startup script:
```bash
"start server.bat"
```
This batch script automatically:
1. Clears loopback port `18080` (resolves socket conflicts).
2. Runs `update_tickers.py` to refresh stock lists.
3. Opens your default web browser to `http://127.0.0.1:18080`.
4. Boots the FastAPI backend server using the virtual environment.

#### On Windows (Manual Execution)
If you prefer to start the application manually on Windows, execute the following commands in your terminal (PowerShell or CMD):
```bash
# 1. Activate the environment
# On Windows (PowerShell):
.\backend\venv\Scripts\Activate.ps1
# On Windows (CMD):
.\backend\venv\Scripts\activate.bat

# 2. Update stock listings index
python update_tickers.py

# 3. Start the FastAPI server
python -m uvicorn backend.main:app --host 127.0.0.1 --port 18080
```
Open your web browser and navigate to **`http://127.0.0.1:18080`** to view the dashboard.

#### On macOS / Linux
Open your terminal and execute the following commands in the workspace root:
```bash
# 1. Activate the environment
source backend/venv/bin/activate

# 2. Update stock listings index
python update_tickers.py

# 3. Start the FastAPI server
python -m uvicorn backend.main:app --host 127.0.0.1 --port 18080
```
Open your web browser and navigate to **`http://127.0.0.1:18080`** to view the dashboard.

---

## 🛠️ Tech Stack

- **Backend**: Python, FastAPI, `yfinance` (Yahoo Finance Data), `pandas-ta` (Technical Analysis Indicators).
- **Frontend**: HTML5, Vanilla JavaScript, CSS3 (Tailwind CSS JIT), TradingView Lightweight Charts, Lucide Icons.

---

## 🔒 Security
- Complete Client-Side HTML-encoding against Cross-Site Scripting (XSS).
- Zero database storage logic eliminates SQL injection vectors.
- No public/private API keys are exposed.

---

## 📄 License

This project is licensed under the MIT License - see the `LICENSE` file for details.
