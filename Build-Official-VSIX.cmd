@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Build-Official-VSIX.ps1"
set "RESULT=%ERRORLEVEL%"
echo.
if not "%RESULT%"=="0" (
  echo Build failed. Read SiteDock-build.log in this folder.
) else (
  echo Build completed. Upload SiteDock-v0.1.9-GigabyteGrove-Official.vsix.
)
pause
exit /b %RESULT%
