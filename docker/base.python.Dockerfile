FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

# Do not use the network during build; wheels must be present
WORKDIR /opt/wheels
COPY vendor/python/py311/wheels /opt/wheels

# Minimal runtime image
FROM python:3.11-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

# Copy wheels from base stage
COPY --from=base /opt/wheels /opt/wheels

# Default workdir for apps
WORKDIR /app
