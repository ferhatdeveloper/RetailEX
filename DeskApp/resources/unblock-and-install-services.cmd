@echo off
setlocal EnableExtensions
cd /d "%~dp0"
net session >nul 2>&1
if %errorlevel% equ 0 goto :_run
echo [RetailEX] Yonetici izni isteniyor (UAC)...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath $env:COMSPEC -Verb RunAs -ArgumentList '/c cd /d \"%~dp0\" ^& call \"%~f0\"'"
exit /b 0
:_run
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0unblock-and-install-services.ps1" -Prefix "%~dp0"
exit /b %errorlevel%
