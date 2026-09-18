# Build context = raiz do repositório (precisa enxergar services/extractor/).
# Ex.: docker build -f services/extractor/Dockerfile .
FROM python:3.12-slim

# tesseract-ocr(-por) = binário do OCR (camada 2 do pipeline, ver
# app/extraction/ocr.py — só olha se "tesseract" está no PATH).
# libgl1/libglib2.0-0/libsm6/libxext6/libxrender1 = libs de runtime que o
# opencv-python-headless ainda importa mesmo na variante "headless".
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr tesseract-ocr-por \
    libgl1 libglib2.0-0 libsm6 libxext6 libxrender1 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app/services/extractor

COPY services/extractor/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY services/extractor/app ./app

ENV PORT=8001
EXPOSE 8001

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
