@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Build-GitHub-Release.ps1" %*
if errorlevel 1 (
  echo.
  echo SiteDock build failed. Check the error above.
  pause
  exit /b 1
)
echo.
echo SiteDock release verification finished.
pause
