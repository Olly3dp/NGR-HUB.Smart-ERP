@echo off
title NGR HUB + NGR BOT
cd /d "%~dp0"
node "%~dp0node_modules\electron\cli.js" .
if errorlevel 1 (
  echo.
  echo Nao foi possivel iniciar o NGR HUB. Confira se o Node.js esta instalado.
  pause
)
