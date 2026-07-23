@echo off
setlocal EnableExtensions
cd /d "%~dp0"

net session >nul 2>&1
if %errorlevel% equ 0 goto :_run

echo [RetailEX] Yonetici izni isteniyor (UAC)...
set "RETAILEX_ELEV_ARGS=%*"
set "_ROOT=%~dp0"
if "%_ROOT:~-1%"=="\" set "_ROOT=%_ROOT:~0,-1%"
set "_ROOTFS=%_ROOT:\=/%"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath $env:COMSPEC -Verb RunAs -ArgumentList '/c cd /d \"%_ROOTFS%\" ^& set \"RETAILEX_ELEV_ARGS=%RETAILEX_ELEV_ARGS%\" ^& call \"%~f0\"'"
exit /b 0

:_run
if not "%RETAILEX_ELEV_ARGS%"=="" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0retailex-admin.ps1" %RETAILEX_ELEV_ARGS%
  set "RETAILEX_ELEV_ARGS="
) else (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0retailex-admin.ps1" %*
)
endlocal
exit /b %errorlevel%
