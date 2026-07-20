@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0bridge-windows-expose-lan.ps1" %*
