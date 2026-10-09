@echo off
rem Tipo de certificado (ultrassom, LP, material...) dos PDFs das abas QUALIDADE e
rem Backup Recebimento: le o conteudo (texto/OCR local) do que ainda nao foi
rem analisado, ~13 min por execucao. Registrado no Agendador de Tarefas como
rem "FCNexus - Classificar certificados" (a cada 15 min).
rem Log local: classificar_certificados.out.log (coberto por .gitignore *.out.log).
cd /d "%~dp0.."
".venv\Scripts\python.exe" "scripts\classificar_certificados.py" >> "classificar_certificados.out.log" 2>&1
