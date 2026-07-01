@echo off
echo ==================================================
echo Starting IDXScan Application...
echo ==================================================

echo Checking for existing processes on port 18080...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :18080') do (
    if not "%%a" == "" (
        echo Killing process %%a using port 18080...
        taskkill /F /PID %%a >nul 2>&1
    )
)

echo.
echo ==================================================
echo 1. Updating Ticker Database from IDX...
echo ==================================================
backend\venv\Scripts\python.exe update_tickers.py

echo.
echo ==================================================
echo 2. Launching Web Dashboard...
echo ==================================================
echo Opening browser...
start http://127.0.0.1:18080
echo.
echo Launching Uvicorn backend server...
backend\venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 18080
pause
