@echo off
setlocal
cd /d "%~dp0"

echo ========================================
echo   ULTRON LOCAL CORE // FILE RAG
 echo ========================================

where py >nul 2>nul
if %errorlevel%==0 (
  set PYTHON=py -3
) else (
  set PYTHON=python
)

if not exist ".venv\Scripts\python.exe" (
  echo [1/4] Criando ambiente virtual...
  %PYTHON% -m venv .venv
  if errorlevel 1 goto :error
)

call ".venv\Scripts\activate.bat"

echo [2/4] Atualizando pip...
python -m pip install --upgrade pip
if errorlevel 1 goto :error

echo [3/4] Instalando/verificando dependencias...
python -m pip install -r requirements.txt
if errorlevel 1 goto :error

echo [4/4] Iniciando Ultron Local Core em http://127.0.0.1:8765
python server.py
goto :eof

:error
echo.
echo Falha ao iniciar o Ultron Local Core.
pause
exit /b 1
