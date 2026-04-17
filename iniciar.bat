@echo off
REM 🚀 SCRIPT DE INICIALIZAÇÃO - IA TRADER

echo.
echo ╔════════════════════════════════════════════════════════╗
echo ║                  🤖 IA TRADER                          ║
echo ║          Sistema de Trading Autônomo Bitcoin           ║
echo ╚════════════════════════════════════════════════════════╝
echo.

REM Verificar se Node.js está instalado
node -v >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js não encontrado! 
    echo Instale em: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo ✅ Node.js detectado: 
node -v

REM Ir para o diretório do projeto
cd /d "%~dp0"

REM Verificar se package.json existe
if not exist "package.json" (
    echo.
    echo ❌ Arquivo package.json não encontrado!
    echo Verifique se está no diretório correto.
    echo.
    pause
    exit /b 1
)

REM Verificar se .env existe
if not exist ".env" (
    echo.
    echo ⚠️  Arquivo .env não encontrado!
    echo Seria melhor criar com suas configurações.
    echo.
)

REM Verificar se node_modules existe
if not exist "node_modules" (
    echo.
    echo 📦 Instalando dependências...
    call npm install
    if errorlevel 1 (
        echo.
        echo ❌ Erro ao instalar dependências!
        pause
        exit /b 1
    )
    echo ✅ Dependências instaladas!
)

echo.
echo ════════════════════════════════════════════════════════
echo ✅ Tudo pronto! Iniciando servidor...
echo ════════════════════════════════════════════════════════
echo.
echo 📡 API:       http://localhost:5561
echo 🔌 WebSocket: ws://localhost:5562
echo 📊 Dashboard: http://localhost:5561/dashboard
echo.
echo Abrindo dashboard...
echo.

REM Abrir o dashboard no navegador
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" "http://localhost:5561/dashboard"
) else if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "http://localhost:5561/dashboard"
) else (
    start http://localhost:5561/dashboard
)

REM Iniciar o servidor
call npm start

pause
