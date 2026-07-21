FROM python:3.12-slim

ARG TORCH_VERSION=2.13.0

RUN python -m pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu "torch==${TORCH_VERSION}" \
    && python -m pip install --no-cache-dir "numpy==2.4.1" "matplotlib==3.11.1" \
    && useradd --create-home --uid 10001 --shell /usr/sbin/nologin sandbox

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOME=/tmp

WORKDIR /workspace
USER 10001:10001

LABEL org.opencontainers.image.title="Rosetta Python Runner" \
      org.opencontainers.image.description="Pinned CPU runtime for executable research knowledge units"
