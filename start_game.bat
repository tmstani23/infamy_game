@echo off
cd /d "%~dp0"
rem Stop any game server still running from an earlier launch, so only one runs
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*game*server.mjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>&1
node game\server.mjs --open
if errorlevel 1 pause
