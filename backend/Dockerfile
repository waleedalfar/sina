FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends gcc libpq-dev && rm -rf /var/lib/apt/lists/*

# pip 25.0.1 as shipped in the base image carries several advisories
# (build-time only, but free to avoid).
RUN pip install --no-cache-dir --upgrade pip

COPY pyproject.toml .
RUN pip install --no-cache-dir -e ".[dev]"

COPY . .

# Defence in depth: nothing here needs root, and a container escape from an
# unprivileged process is strictly harder. The model-storage volume is
# chowned so imports can still write to it.
RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p /models \
    && chown -R appuser:appuser /app /models
USER appuser

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
