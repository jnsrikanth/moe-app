#!/usr/bin/env python3
"""
One-time helper to bake and download wheels into vendor/python/py311/wheels.
Run this ONLY when you have internet access, then commit the wheels for offline builds.
"""
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PY_VER = f"py{sys.version_info.major}{sys.version_info.minor}"
WHEELHOUSE = ROOT / f"vendor/python/{PY_VER}/wheels"
AGENTS = [
    ROOT / "agents/credit_agent/pyproject.toml",
    ROOT / "agents/fraud_agent/pyproject.toml",
    ROOT / "agents/esg_agent/pyproject.toml",
    ROOT / "agents/moe_router/pyproject.toml",
]


def ensure_dirs():
    WHEELHOUSE.mkdir(parents=True, exist_ok=True)


def ensure_pip():
    # Ensure pip is available for the current interpreter
    try:
        subprocess.check_call([sys.executable, "-m", "ensurepip", "--upgrade"])  # works even if pip missing
    except Exception:
        pass
    subprocess.check_call([sys.executable, "-m", "pip", "install", "--upgrade", "pip"])


def pip_download(requirements: list[str]):
    cmd = [
        sys.executable,
        "-m",
        "pip",
        "wheel",
        "--wheel-dir",
        str(WHEELHOUSE),
        *requirements,
    ]
    print("Downloading wheels:", " ".join(requirements))
    subprocess.check_call(cmd)


def main():
    ensure_dirs()
    ensure_pip()

    # Core dependencies common across agents
    core = [
        "fastapi==0.115.0",
        "uvicorn[standard]==0.30.6",
        "pydantic==2.8.2",
        "httpx==0.27.2",
        "jinja2==3.1.4",
        # Optional Google SDK (skip if you do not use Vertex locally)
        "google-cloud-aiplatform==1.70.0",
        # Offline ML stack
        "numpy==1.26.4",
        "scipy==1.11.4",
        "scikit-learn==1.4.2",
        "joblib==1.4.2",
        "python-multipart==0.0.9",
    ]
    pip_download(core)

    print(f"Wheels are in {WHEELHOUSE}")


if __name__ == "__main__":
    main()
