@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-postgrest-lan.ps1" -InstallDir "%~dp0" %*
