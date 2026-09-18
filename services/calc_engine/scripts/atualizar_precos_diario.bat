@echo off
rem Roda importar_precos_erp.py com o Python do venv do calc_engine e grava
rem log local (atualizar_precos.out.log, ja coberto por .gitignore *.out.log).
rem Registrado no Agendador de Tarefas do Windows como "FCNexus - Atualizar precos ERP".
cd /d "%~dp0.."
".venv\Scripts\python.exe" "scripts\importar_precos_erp.py" >> "atualizar_precos.out.log" 2>&1
