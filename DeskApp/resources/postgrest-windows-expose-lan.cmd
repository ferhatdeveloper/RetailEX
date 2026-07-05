@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0postgrest-windows-expose-lan.ps1" %*
