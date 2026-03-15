@echo off
:: RetailEX Quick Service Repair
:: Run as Administrator

echo RetailEX Servisleri Onariliyor...
cd /d "%~dp0"

echo [1/4] Servisler durduruluyor...
net stop RetailEX_Service /y
net stop RetailEX_VPN /y

echo [2/4] Eski kayitlar temizleniyor...
RetailEX_Service.exe --uninstall
RetailEX_VPN.exe --uninstall

echo [3/4] Servisler yeniden kuruluyor...
RetailEX_Service.exe --install
RetailEX_VPN.exe --install

echo [4/4] Servisler baslatiliyor...
net start RetailEX_Service
net start RetailEX_VPN

echo.
echo Islem tamamlandi.
pause
