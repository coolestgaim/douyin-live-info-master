@echo off
chcp 65001 >nul
echo ═══════════════════════════════
echo   卡密生成工具
echo ═══════════════════════════════
echo.
set /p uid="输入用户ID: "
set /p days="输入天数(默认30): "
if "%days%"=="" set days=30
echo.
node "%~dp0gen-key.js" %uid% %days%
echo.
pause
