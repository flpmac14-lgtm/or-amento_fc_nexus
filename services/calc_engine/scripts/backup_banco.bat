@echo off
rem Backup diario do banco (backup_banco.py) com o Python do venv; log em backup_banco.out.log.
rem Registrado no Agendador de Tarefas como "FCNexus - Backup diario do banco" (todo dia 12:20).
cd /d "%~dp0.."
".venv\Scripts\python.exe" "scripts\backup_banco.py" >> "backup_banco.out.log" 2>&1
