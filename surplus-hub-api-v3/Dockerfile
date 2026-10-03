# ---- Build stage ----
FROM python:3.11-slim AS builder

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ---- Production stage ----
FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 wget \
    && rm -rf /var/lib/apt/lists/* \
    && addgroup --system app && adduser --system --group app

COPY --from=builder /install /usr/local

COPY . .

RUN chmod +x /app/docker-entrypoint.sh \
 && chown -R app:app /app
USER app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8000/health || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
# CMD becomes "$@" in docker-entrypoint.sh (alembic upgrade head -> exec "$@").
# Without this the container runs migrations and then exits without serving.
CMD ["gunicorn", "app.main:app", "-c", "gunicorn.conf.py"]
