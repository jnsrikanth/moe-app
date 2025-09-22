# Single-stage, stdlib-only Python ML service
FROM python:3.11-slim

WORKDIR /app

# No additional deps needed (pure stdlib)
COPY app.py ./

# Run server on container port
ENV PORT=8080
ENV PY_LOCAL_HOST=0.0.0.0
ENV PY_LOCAL_PORT=8080
ENV LOCAL_ML_LABEL=mlp-local

EXPOSE 8080
CMD ["python3", "app.py"]