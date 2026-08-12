@echo off
chcp 65001 >nul
title RetailEX Terazi - Hizli Kurulum
echo.
echo  RetailEX Terazi Otomatik Senkron Kurulumu
echo  ========================================
echo.

set ROOT=%~dp0
set CFG=C:\ProgramData\RetailEX\terazi-sync.json
set MGR=%ROOT%WindowsFormsApplication1\bin\x86\Release\RetailEX.TeraziManager.exe

if not exist "%ROOT%WindowsFormsApplication1\bin\x86\Release\RetailEX.TeraziManager.exe" (
  echo [HATA] Once Visual Studio ile Release ^| x86 derleyin.
  pause
  exit /b 1
)

if not exist "C:\ProgramData\RetailEX" mkdir "C:\ProgramData\RetailEX"
if not exist "%CFG%" copy /Y "%ROOT%terazi-sync.example.json" "%CFG%"

echo [1/3] Config: %CFG%
echo       Token ve kiracı kodunu duzenleyin...
start notepad "%CFG%"
timeout /t 2 >nul

echo [2/3] Yonetim arayuzu aciliyor...
start "" "%MGR%"

echo [3/3] Windows servisi icin sag tik - Yonetici olarak calistir:
echo       install-service.ps1
echo.
pause
