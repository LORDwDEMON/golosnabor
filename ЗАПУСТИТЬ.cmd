@echo off
rem Zapusk GolosNabora. Peremennaya ELECTRON_RUN_AS_NODE snimaetsya,
rem inache Electron startuet kak Node i okno ne poyavlyaetsya.
set "ELECTRON_RUN_AS_NODE="
cd /d "%~dp0app"
start "" "%~dp0app\node_modules\electron\dist\electron.exe" "%~dp0app"