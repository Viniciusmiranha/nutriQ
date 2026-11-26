@echo off
chcp 65001 >nul
title NUTRIQ - Servidor local
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo  Node.js nao foi encontrado neste computador.
    echo  Instale a versao LTS em https://nodejs.org e execute este arquivo novamente.
    echo.
    pause
    exit /b 1
)

for /f "tokens=1 delims=v." %%v in ('node -v') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 21 (
    echo.
    echo  E necessario o Node.js 21 ou superior. Versao instalada:
    node -v
    echo.
    pause
    exit /b 1
)

if not exist ".env" if exist ".env.example" copy ".env.example" ".env" >nul

if not exist "node_modules\mysql2" (
    echo.
    echo  Instalando dependencias, aguarde...
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo.
        echo  Nao foi possivel instalar as dependencias. Verifique a conexao com a internet.
        echo.
        pause
        exit /b 1
    )
)

set PORTA=3000
for /f "tokens=2 delims==" %%p in ('findstr /b /c:"PORT=" .env 2^>nul') do set PORTA=%%p

start "" /b cmd /c "timeout /t 6 /nobreak >nul & start http://localhost:%PORTA%"
node servidor\servidor.js

echo.
pause
