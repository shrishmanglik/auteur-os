@echo off
setlocal
title AUTEUR Studio
where node >nul 2>nul
if errorlevel 1 (
  echo AUTEUR requires Node.js, but node.exe was not found.
  pause
  exit /b 1
)
cd /d "%~dp0"
node scripts\serve-offline.mjs
