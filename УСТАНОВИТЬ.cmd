@echo off
setlocal EnableDelayedExpansion
title GolosNabor installer

set "KIT=%~dp0"
if "%KIT:~-1%"=="\" set "KIT=%KIT:~0,-1%"
set "APP=%KIT%\app"
set "ENGINE=%KIT%\engine"

echo.
echo  GolosNabor / GolosNabor - ustanovka
echo  ==================================
echo  Papka komplekta: %KIT%
echo.

if not exist "%APP%\node_modules\electron\dist\electron.exe" (
  echo  [ERROR] Net prilozheniya: %APP%\node_modules\electron\dist\electron.exe
  echo  Raspakuyte arhiv celikom, ne razdelyaya papki.
  pause
  exit /b 1
)
echo  [1/4] Prilozhenie na meste.

if exist "%ENGINE%\bin\whisper-cli.exe" (
  echo  [2/4] Dvizhok raspoznavaniya na meste.
) else (
  echo  [2/4] VNIMANIE: papki engine net, raspoznavanie rabotat ne budet.
)

set "CFG=%APPDATA%\golosnabor"
if not exist "%CFG%" mkdir "%CFG%"
if exist "%CFG%\settings.json" (
  echo  [3/4] Nastrojki uzhe est, ostavlyayu prezhnie.
) else (
  if exist "%APP%\settings.default.json" (
    copy /y "%APP%\settings.default.json" "%CFG%\settings.json" >nul
    echo  [3/4] Nastrojki skopirovany iz komplekta: app\settings.default.json
  ) else (
    echo  [3/4] VNIMANIE: net fajla app\settings.default.json, nastrojki budut po umolchaniyu.
  )
)

where node >nul 2>nul
if errorlevel 1 (
  echo  [4/4] Node.js ne najden - samoproverka propushchena.
) else (
  echo  [4/4] Proverka raspoznavaniya, do minuty...
  pushd "%APP%"
  node check.mjs
  if errorlevel 1 (
    echo  VNIMANIE: samoproverka ne proshla. Smotrite PROCHTI_MENYA.md.
  ) else (
    echo  Raspoznavanie rabotaet.
  )
  popd
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%KIT%\shortcut.ps1" -Kit "%KIT%"

echo.
echo  Gotovo. Zapusk: yarlyk "GolosNabor" ili fajl ZAPUSTIT.cmd
echo  Klavisha diktovki: Scroll Lock (derzhite, poka govorite).
echo.
echo  Avtozapusk pri vhode v Windows - smotrite PROCHTI_MENYA.md, razdel "Avtozapusk".
echo.
pause
endlocal