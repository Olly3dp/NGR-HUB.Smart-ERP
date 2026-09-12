@echo off
chcp 65001 > nul
title NGR Bot - REINSTALAR
echo.
echo ================================================
echo   NGR BOT - REINSTALAR
echo ================================================
echo.
echo Isso ira remover:
echo   - node_modules (dependencias)
echo   - .wwebjs_auth (sessao WhatsApp)
echo   - .wwebjs_cache (cache)
echo   - Servidor na porta 3000
echo.
set /p CONFIRM="Digite YES para confirmar: "
if "%CONFIRM%" neq "YES" (
    echo Cancelado.
    pause
    exit /b 0
)

cd /d "%~dp0"

echo.
echo Encerrando servidor...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo Removendo arquivos...
rmdir /S /Q node_modules 2>nul
rmdir /S /Q .wwebjs_auth 2>nul
rmdir /S /Q .wwebjs_cache 2>nul
del /f /q nul 2>nul

echo Arquivos removidos!
echo.
echo Instalando nova versao...
echo (Pode demorar 1-2 minutos)
echo.

call npm install

if %errorlevel% neq 0 (
    echo.
    echo [ERRO] Falha ao instalar.
    pause
    exit /b 1
)

echo.
echo ================================================
echo   Instalacao concluida!
echo ================================================
echo.
echo Para iniciar, execute: INICIAR.bat
echo Ou: node server.js
echo Acesse: http://localhost:3000
echo.
pause