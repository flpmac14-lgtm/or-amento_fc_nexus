# Build context = raiz do repositório (precisa enxergar services/calc_engine/).
# Ex.: docker build -f services/calc_engine/Dockerfile .
FROM python:3.12-slim

# Mantém a mesma profundidade de diretórios do repo (services/calc_engine/app/...)
# porque app/precos_mercado.py calcula a raiz do projeto subindo 3 níveis a
# partir de __file__ — fora dessa estrutura ele quebra na importação.
WORKDIR /app/services/calc_engine

COPY services/calc_engine/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY services/calc_engine/app ./app
COPY services/calc_engine/data ./data

ENV PORT=8002
EXPOSE 8002

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
