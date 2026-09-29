@echo off
rem Roda sincronizar_material_compra.py com o Python do venv do calc_engine e grava
rem log local (sincronizar_material_compra.out.log, ja coberto por .gitignore *.out.log).
rem Registrado no Agendador de Tarefas do Windows como "FCNexus - Sincronizar Material de compra" (a cada 15 min).
cd /d "%~dp0.."
".venv\Scripts\python.exe" "scripts\sincronizar_material_compra.py" >> "sincronizar_material_compra.out.log" 2>&1
