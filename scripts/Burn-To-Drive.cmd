@echo off
REM AsinERP portable — hedef sürücüye bas (CD-ROM mantığı)
REM Kullanım: Burn-To-Drive.cmd E:
REM Bu CMD, zip açıldıktan sonra tools\ klasöründen çalıştırılır; kaynak = üst klasör.

setlocal
set "DRIVE=%~1"
if "%DRIVE%"=="" (
  echo Kullanim: Burn-To-Drive.cmd E:
  echo Once sürücü listesi:
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0AsinERP-Portable-Writer.ps1" -List
  exit /b 1
)

set "SRC=%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0AsinERP-Portable-Writer.ps1" -SourceDir "%SRC%" -TargetDrive %DRIVE%
exit /b %ERRORLEVEL%
