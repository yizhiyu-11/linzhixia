@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "app\data\web-token" ( echo Not installed yet. Run the installer first. & pause & exit /b 1 )
for /f "usebackq delims=" %%p in (`powershell -NoProfile -Command "(Get-Content 'app\.env' | Where-Object { $_ -match '^WEB_PORT=' }) -replace 'WEB_PORT=',''"`) do set "PORT=%%p"
if not defined PORT set "PORT=3870"
set /p TOKEN=<app\data\web-token
start "" "http://127.0.0.1:%PORT%/?token=%TOKEN%"
