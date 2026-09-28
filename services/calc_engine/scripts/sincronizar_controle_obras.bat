@echo off
rem Roda sincronizar_controle_obras.py com o Python do venv do calc_engine e grava
rem log local (sincronizar_controle_obras.out.log, ja coberto por .gitignore *.out.log).
rem Registrado no Agendador de Tarefas do Windows como "FCNexus - Sincronizar Controle de obras" (a cada 15 min).
cd /d "%~dp0.."
".venv\Scripts\python.exe" "scripts\sincronizar_controle_obras.py" >> "sincronizar_controle_obras.out.log" 2>&1
