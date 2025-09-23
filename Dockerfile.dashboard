FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080 \
    LOG_LEVEL=WARNING

WORKDIR /app

# Wheels and source
COPY vendor/python/py311/wheels /wheels
COPY web /app/web

RUN pip install --no-cache-dir --no-index --find-links=/wheels \
    fastapi==0.115.0 uvicorn[standard]==0.30.6 jinja2==3.1.4 python-multipart==0.0.9 httpx==0.27.2

CMD ["sh", "-lc", "exec uvicorn web.app:app --host 0.0.0.0 --port ${PORT}"]
