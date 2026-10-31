@echo off
chcp 65001 >nul
cd /d "%~dp0app"
echo Checking QQ connection...
echo.
"%~dp0runtime\node.exe" "scripts\test-onebot.mjs"
echo.
pause
