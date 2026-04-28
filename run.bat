@echo off
REM Run gemma4-rp. Checks prerequisites, sets up missing pieces, then starts the server.
REM Double-click to launch, or run from a terminal.

cd /d "%~dp0"

echo === gemma4-rp ===
echo.

REM ---- Python on PATH ----
where python >nul 2>nul
if errorlevel 1 (
    echo ERROR: Python is not on PATH.
    echo Install Python 3.10 or newer from https://www.python.org/downloads/
    echo Make sure "Add to PATH" is checked during install, then re-run this script.
    pause
    exit /b 1
)

REM ---- Python venv ----
if not exist "venv\Scripts\python.exe" (
    echo [setup] Creating Python venv...
    python -m venv venv
    if errorlevel 1 (
        echo ERROR: Failed to create venv.
        pause
        exit /b 1
    )
)

REM ---- Python deps ----
venv\Scripts\python.exe -c "import fastapi, httpx" >nul 2>nul
if errorlevel 1 (
    echo [setup] Installing Python dependencies...
    venv\Scripts\python.exe -m pip install --upgrade pip
    venv\Scripts\python.exe -m pip install -r requirements.txt
    if errorlevel 1 (
        echo ERROR: pip install failed. See output above.
        pause
        exit /b 1
    )
)

REM ---- Node.js on PATH ----
where node >nul 2>nul
if errorlevel 1 (
    echo ERROR: Node.js is not on PATH.
    echo Install Node 18 or newer from https://nodejs.org/ then re-run this script.
    pause
    exit /b 1
)

REM ---- Frontend deps ----
if not exist "frontend\node_modules" (
    echo [setup] Installing frontend dependencies, this may take a minute...
    cd /d "%~dp0frontend"
    call npm install
    cd /d "%~dp0"
    if not exist "frontend\node_modules" (
        echo ERROR: npm install failed.
        pause
        exit /b 1
    )
)

REM ---- Frontend build ----
if not exist "frontend\dist\index.html" (
    echo [setup] Building frontend...
    cd /d "%~dp0frontend"
    call npm run build
    cd /d "%~dp0"
    if not exist "frontend\dist\index.html" (
        echo ERROR: Frontend build failed.
        pause
        exit /b 1
    )
)

echo.
echo === Starting server at http://localhost:8000 ===
echo Press Ctrl+C to stop.
echo.

venv\Scripts\python.exe server.py
