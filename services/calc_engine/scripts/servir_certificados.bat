@echo off
rem Vigia dos PDFs de certificado (aba QUALIDADE): sobe sob demanda o PDF que o
rem site pediu. Cada execucao vigia ~14 min e sai; registrado no Agendador de
rem Tarefas como "FCNexus - Certificados sob demanda" (a cada 15 min).
rem Log local: servir_certificados.out.log (coberto por .gitignore *.out.log).
cd /d "%~dp0.."
".venv\Scripts\python.exe" "scripts\servir_certificados.py" >> "servir_certificados.out.log" 2>&1
