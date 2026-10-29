@echo off
title Secure Client Document Portal
cd /d "%~dp0"
echo ========================================================
echo   SECURE CLIENT DOCUMENT PORTAL - ZERO-ERROR CHUNK ENGINE
echo ========================================================
echo.
echo Starting backend server on port 4000...
start http://localhost:4000
node server.js
pause
