@echo off
:: RetailEX Service Management Script
:: Run as Administrator

set SERVICE_EXE=RetailEX_Service.exe
set VPN_EXE=RetailEX_VPN.exe

:menu
cls
echo ==========================================
echo    RetailEX Servis Yonetimi
echo ==========================================
echo 1. Servisleri Kur (Install)
echo 2. Servisleri Kaldir (Uninstall)
echo 3. Servisleri Calistir (Start)
echo 4. Servisleri Durdur (Stop)
echo 5. Cikis
echo ==========================================
set /p choice="Seciminizi yapin (1-5): "

if "%choice%"=="1" goto install
if "%choice%"=="2" goto uninstall
if "%choice%"=="3" goto start
if "%choice%"=="4" goto stop
if "%choice%"=="5" exit
goto menu

:install
echo.
echo Servisler kuruluyor...
if exist "%SERVICE_EXE%" (
    "%SERVICE_EXE%" --install
) else (
    echo HATA: %SERVICE_EXE% bulunamadi!
)

if exist "%VPN_EXE%" (
    "%VPN_EXE%" --install
) else (
    echo HATA: %VPN_EXE% bulunamadi!
)
pause
goto menu

:uninstall
echo.
echo Servisler kaldiriliyor...
if exist "%SERVICE_EXE%" (
    "%SERVICE_EXE%" --uninstall
)
if exist "%VPN_EXE%" (
    "%VPN_EXE%" --uninstall
)
pause
goto menu

:start
echo.
echo Servisler baslatiliyor...
net start RetailEX_Service
net start RetailEX_VPN
pause
goto menu

:stop
echo.
echo Servisler durduruluyor...
net stop RetailEX_Service
net stop RetailEX_VPN
pause
goto menu
