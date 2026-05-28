FROM python:3.12-slim

# Install Tesseract for image OCR
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-eng \
    poppler-utils \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
ENV EXTRACTOR_WORKERS=2
ENV EXTRACT_MAX_CONCURRENT=4
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port 8000 --workers ${EXTRACTOR_WORKERS:-2}"]
