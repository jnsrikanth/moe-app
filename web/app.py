from __future__ import annotations
import os
import re
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional

import httpx
from fastapi import FastAPI, Request, Form
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

ROOT = Path(__file__).resolve().parent
TEMPLATES = Jinja2Templates(directory=str(ROOT / "templates"))

LOGS_DIR = ROOT / "logs" / "moe_requests"

app = FastAPI(title="MoE Dashboard", version="0.2.0")
app.mount("/static", StaticFiles(directory=str(ROOT / "static")), name="static")

ROUTER_URL = os.getenv("ROUTER_URL", "http://localhost:8080")
CREDIT_URL = os.getenv("CREDIT_URL", "http://localhost:8081")
FRAUD_URL = os.getenv("FRAUD_URL", "http://localhost:8082")
ESG_URL = os.getenv("ESG_URL", "http://localhost:8083")

# Predefined request templates (banking use cases)
REQUEST_TEMPLATES: Dict[str, Dict[str, Any]] = {
    "personal_loan": {
        "label": "Personal Loan Application",
        "type": "credit",
        "content": "Please evaluate personal loan eligibility and creditworthiness.",
        "metadata": {"annual_income": 65000, "debt_to_income": 0.32, "credit_utilization": 0.28},
    },
    "credit_card": {
        "label": "Credit Card Application",
        "type": "credit",
        "content": "Please assess credit card approval likelihood and recommended limit.",
        "metadata": {"annual_income": 72000, "debt_to_income": 0.25, "credit_utilization": 0.22},
    },
    "mortgage": {
        "label": "Mortgage Application",
        "type": "credit",
        "content": "Evaluate mortgage loan eligibility and risk profile for home purchase.",
        "metadata": {"annual_income": 120000, "down_payment_ratio": 0.2, "dti_mortgage": 0.36},
    },
    "car_loan": {
        "label": "Car Loan Application",
        "type": "credit",
        "content": "Assess auto loan eligibility and rate tier.",
        "metadata": {"annual_income": 80000, "debt_to_income": 0.3, "vehicle_age_years": 1},
    },
    "business_loan": {
        "label": "Business Loan Application",
        "type": "credit",
        "content": "Evaluate SME business loan eligibility; include basic fraud risk screen.",
        "metadata": {"annual_revenue": 450000, "profit_margin": 0.12, "years_in_business": 4},
    },
    "esg_investment": {
        "label": "ESG Investment Analysis",
        "type": "esg",
        "content": "Provide ESG risk and opportunity assessment summary.",
        "metadata": {"sector": "technology", "region": "NA", "time_horizon_years": 5},
    },
    "anti_fraud_review": {
        "label": "Anti-Fraud Review",
        "type": "fraud",
        "content": "Investigate recent suspicious transactions for fraud likelihood.",
        "metadata": {"tx_window_days": 14, "high_risk_merchants": True},
    },
    "general": {
        "label": "General Inquiry",
        "type": "general",
        "content": "General routing request.",
        "metadata": {},
    },
}


def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9\-\s]", "", text)
    text = re.sub(r"\s+", "-", text)
    text = re.sub(r"-+", "-", text)
    return text or "general"


def write_log(category_slug: str, record: Dict[str, Any]) -> None:
    base = LOGS_DIR / category_slug
    base.mkdir(parents=True, exist_ok=True)
    fname = base / f"{datetime.utcnow().date().isoformat()}.jsonl"
    # JSON lines for easy offline parsing
    with fname.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


def aggregate_metrics() -> Dict[str, Any]:
    """Aggregate metrics from JSONL logs.
    Returns {
      'use_cases': {label: {'total': int, 'approved': int, 'declined': int, 'unknown': int}},
      'agents': {'credit-agent': int, 'fraud-agent': int, 'esg-agent': int}
    }
    """
    use_cases: Dict[str, Dict[str, int]] = {}
    agents: Dict[str, int] = {"credit-agent": 0, "fraud-agent": 0, "esg-agent": 0}
    if not LOGS_DIR.exists():
        return {"use_cases": use_cases, "agents": agents}
    try:
        for cat_dir in LOGS_DIR.iterdir():
            if not cat_dir.is_dir():
                continue
            for lf in sorted(cat_dir.glob("*.jsonl")):
                try:
                    with lf.open("r", encoding="utf-8") as f:
                        for line in f:
                            line = line.strip()
                            if not line:
                                continue
                            try:
                                obj = json.loads(line)
                            except Exception:
                                continue
                            label = obj.get("category") or cat_dir.name
                            decision = (obj.get("decision") or "Unknown").title()
                            uc = use_cases.setdefault(label, {"total": 0, "approved": 0, "declined": 0, "unknown": 0})
                            uc["total"] += 1
                            if decision == "Approved":
                                uc["approved"] += 1
                            elif decision == "Declined":
                                uc["declined"] += 1
                            else:
                                uc["unknown"] += 1
                            # Count agents that produced responses
                            responses = ((obj.get("router_response") or {}).get("responses") or {})
                            for key in responses.keys():
                                if key in agents:
                                    agents[key] += 1
                except Exception:
                    # Skip file on error
                    continue
    except Exception:
        pass
    return {"use_cases": use_cases, "agents": agents}


@app.get("/health", response_class=JSONResponse)
async def health() -> Dict[str, str]:
    return {"status": "healthy"}


async def get_status() -> Dict[str, str]:
    async with httpx.AsyncClient(timeout=1.5) as client:
        async def chk(url: str) -> str:
            try:
                r = await client.get(f"{url}/health")
                return "OK" if r.status_code == 200 else f"ERR {r.status_code}"
            except Exception:
                return "DOWN"
        return {
            "router": await chk(ROUTER_URL),
            "credit": await chk(CREDIT_URL),
            "fraud": await chk(FRAUD_URL),
            "esg": await chk(ESG_URL),
        }


def extract_decision(result: Optional[Dict[str, Any]]) -> str:
    if not result:
        return "Unknown"
    # Heuristic: look for approval/eligibility markers in responses
    try:
        responses = result.get("responses", {})
        blob = json.dumps(responses).lower()
        if ("approved" in blob) or ("eligible" in blob and "false" not in blob):
            return "Approved"
        if ("declined" in blob) or ("eligible\": false" in blob) or ("not eligible" in blob):
            return "Declined"
    except Exception:
        pass
    return "Unknown"


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    status = await get_status()
    metrics = aggregate_metrics()
    return TEMPLATES.TemplateResponse("index.html", {
        "request": request,
        "status": status,
        "router_url": ROUTER_URL,
        "request_templates": REQUEST_TEMPLATES,
        "request_templates_json": json.dumps(REQUEST_TEMPLATES),
        "metrics": metrics,
    })


@app.post("/route", response_class=HTMLResponse)
async def route(request: Request,
                template: str = Form("general"),
                req_type: str = Form("general"),
                content: str = Form("")
                ):
    # Resolve template defaults
    tpl = REQUEST_TEMPLATES.get(template, REQUEST_TEMPLATES["general"])
    resolved_type = req_type or tpl["type"]
    resolved_content = content or tpl["content"]
    metadata = tpl.get("metadata", {})

    payload = {
        "type": resolved_type,
        "content": resolved_content,
        "metadata": metadata,
        "template": template,
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }

    result = None
    error = None
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(f"{ROUTER_URL}/route", json=payload)
            if resp.status_code == 200:
                result = resp.json()
            else:
                error = f"Router error: {resp.status_code}"
    except Exception as e:
        error = str(e)

    decision = extract_decision(result)

    # Write JSONL audit log
    try:
        category_label = tpl["label"]
        category_slug = slugify(category_label)
        log_record = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "category": category_label,
            "category_slug": category_slug,
            "request_payload": payload,
            "router_response": result,
            "error": error,
            "decision": decision,
        }
        write_log(category_slug, log_record)
    except Exception:
        # Logging failures should not break UX
        pass

    status = await get_status()
    metrics = aggregate_metrics()
    return TEMPLATES.TemplateResponse("index.html", {
        "request": request,
        "status": status,
        "router_url": ROUTER_URL,
        "result": result,
        "error": error,
        "last_request": payload,
        "decision": decision,
        "request_templates": REQUEST_TEMPLATES,
        "request_templates_json": json.dumps(REQUEST_TEMPLATES),
        "metrics": metrics,
    })
