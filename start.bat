@echo off
REM Career Matrix - start it and open it.
REM
REM Double-click this file. It installs the dependencies on the first run, starts the local
REM server, and opens the app in your browser. Nothing you type into the app leaves this
REM computer: your profile, applications and portfolio live in this browser's storage.

cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo.
  echo npm was not found, so there is nothing to start the app with.
  echo Install Node.js 20 or newer from https://nodejs.org, then double-click this again.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo.
  echo First run: installing the dependencies. A few minutes, and it needs internet.
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo The install failed - check the messages above, then try again.
    pause
    exit /b 1
  )
)

echo.
echo Starting Career Matrix. The app will open in your browser in a few seconds.
echo Leave this window open while you use it, and close it to stop the server.
echo.

start "" http://localhost:3000
call npm run dev
