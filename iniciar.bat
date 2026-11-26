
@echo off
setlocal
chcp 65001 >nul
title NUTRIQ - Servidor de Demonstracao

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo Node.js nao encontrado. Instale em https://nodejs.org
    pause
    exit /b 1
)

node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>20||(a===20&&b>=12)?0:1)"
if errorlevel 1 (
    echo Necessario Node.js 20.12 ou superior.
    node -v
    pause
    exit /b 1
)

if not exist ".env" (
    if exist ".env.example" copy ".env.example" ".env" >nul
)

if not exist "node_modules\express" (
    echo Instalando dependencias...
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo Erro ao instalar dependencias.
        pause
        exit /b 1
    )
)

set "NUTRIQ_MODO_DEMO=true"

echo.
echo Iniciando NUTRIQ em modo de demonstracao...
echo Endereco: http://localhost:3000
echo.

start "" cmd /c "timeout /t 5 /nobreak >nul & start http://localhost:3000"

node servidor\servidor.js

echo.
echo Servidor encerrado.
pause
