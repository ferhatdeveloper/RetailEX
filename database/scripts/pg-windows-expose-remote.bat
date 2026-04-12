@echo off
setlocal
cd /d "%~dp0"
REM PostgreSQL uzaktan erişim: önce yedek (%%USERPROFILE%%\pg_config_backup\...), sonra conf + isteğe bağlı firewall.
REM Kullanım:
REM   pg-windows-expose-remote.bat
REM   pg-windows-expose-remote.bat "C:\Program Files\PostgreSQL\16\data" "10.8.0.0/24"
REM   pg-windows-expose-remote.bat -SkipFirewall
REM   Tum aglar (kurulum): -AllowAllNetworks
REM
REM Argümanlar PowerShell'e iletilir: 1=PgData, 2=AllowCidr
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0pg-windows-expose-remote.ps1" %*
exit /b %ERRORLEVEL%
