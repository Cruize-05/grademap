# GradeMap mining service — built from the repo root as Docker context:
#   docker build -f apps/mining/Dockerfile .
# On Railway: set "Dockerfile Path" = apps/mining/Dockerfile.

FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for psycopg2
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY apps/mining/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY apps/mining/app ./app

ENV PYTHONUNBUFFERED=1
# UVICORN_HOST :: binds dual-stack (IPv4 + IPv6). IPv6 is required for
# Railway private networking (mining.railway.internal). docker-compose
# overrides this to 0.0.0.0.
ENV UVICORN_HOST=::
ENV PORT=8000

EXPOSE 8000
# Shell form so ${PORT} (injected by Railway) is honoured.
CMD uvicorn app.main:app --host "$UVICORN_HOST" --port "$PORT"
