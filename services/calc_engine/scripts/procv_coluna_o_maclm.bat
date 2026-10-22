@echo off
rem Roda procv_coluna_o_maclm.ps1 e grava log local (procv_coluna_o_maclm.out.log, coberto por .gitignore *.out.log).
rem Registrado no Agendador de Tarefas do Windows como "FCNexus - PROCV coluna O do MACLM" (a cada 15 min).
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\procv_coluna_o_maclm.ps1" >> "procv_coluna_o_maclm.out.log" 2>&1
