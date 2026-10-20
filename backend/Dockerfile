FROM python:3.12-slim@sha256:a6e34c598f2467ed0e9a8d349809fcd8b5c603269512df273a0bb1784edc11b1

RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir --timeout 120 uv==0.10.9
ENV UV_PROJECT_ENVIRONMENT=/opt/venv
ENV PATH="/opt/venv/bin:$PATH"
WORKDIR /workspace/backend
COPY pyproject.toml uv.lock ./
COPY app ./app
RUN uv sync --frozen --extra dev
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
