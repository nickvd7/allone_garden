@echo off
:: AllOne Garden Launcher for Windows
:: Double-click this file to start the launcher.
:: https://github.com/nickvd7/allone_garden

title AllOne Garden Launcher

:: Run the PowerShell script in the same directory with a permissive
:: execution policy (scoped to this process only, does not change system policy).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0allone-garden.ps1"

:: Keep window open if PS exited with an error
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Launcher exited with error code %ERRORLEVEL%.
    pause
)
