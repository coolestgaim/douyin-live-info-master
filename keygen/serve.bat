@echo off
chcp 65001 >nul
echo [OK] Starting Key Manager...
echo.
echo Open http://localhost:18080 in your browser
echo Press Ctrl+C to stop
echo.
cd /d "%~dp0"
node -e "var h=require('http'),f=require('fs'),p=require('path');h.createServer(function(q,r){f.readFile(p.join(__dirname,'admin.html'),function(e,d){if(e){r.writeHead(404);r.end('Not found');return}r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(d)})}).listen(18080,function(){var s='http://localhost:18080';console.log('Server: '+s);require('child_process').exec('start '+s)})"
pause
