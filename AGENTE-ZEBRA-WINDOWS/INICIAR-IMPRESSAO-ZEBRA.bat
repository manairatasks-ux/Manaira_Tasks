@echo off
chcp 65001 >nul
title Manaira Board - Agente Zebra
cd /d "%~dp0"
py -3 agente_zebra.py
if errorlevel 1 python agente_zebra.py
pause
