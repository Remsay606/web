@echo off
cd /d "%~dp0"
node tools/run.mjs
if errorlevel 1 pause
