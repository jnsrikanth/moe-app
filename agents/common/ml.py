from __future__ import annotations
import os
from dataclasses import dataclass
from typing import Any, Dict, Optional, List

try:
    import joblib  # type: ignore
except Exception:
    joblib = None  # type: ignore


@dataclass
class LoadedModel:
    kind: str  # "credit" | "fraud" | "esg" | "router"
    model: Any


def load_model(path: str, kind: str) -> Optional[LoadedModel]:
    if not path:
        return None
    if not os.path.exists(path):
        return None
    if joblib is None:
        return None
    try:
        m = joblib.load(path)
        return LoadedModel(kind=kind, model=m)
    except Exception:
        return None


# Heuristic fallbacks keep behavior deterministic when no model is available.

def simple_credit_score(meta: Dict[str, Any]) -> Dict[str, Any]:
    dti = float(meta.get("debt_to_income", 0.35))
    income = float(meta.get("annual_income", 60000))
    hist = float(meta.get("payment_history", 0.9))  # 0..1
    util = float(meta.get("credit_utilization", 0.3))  # 0..1
    score = 850 - (util * 200) - (dti * 300) + (hist * 150) + min(50, income / 50000 * 20)
    score = max(300, min(850, int(score)))
    rating = "Excellent" if score >= 750 else "Good" if score >= 700 else "Fair" if score >= 650 else "Poor"
    return {
        "score": score,
        "rating": rating,
        "confidence": 0.7,
        "factors": ["heuristic", f"DTI={dti}", f"UTIL={util}"]
    }


def simple_fraud_scores(meta: Dict[str, Any]) -> Dict[str, Any]:
    amount = float(meta.get("amount", 100.0))
    velocity = int(meta.get("recent_txn_count", 1))
    distance = float(meta.get("geo_distance_km", 0.0))
    risk = 0.0
    if amount > 1000: risk += 20
    if velocity > 5: risk += 25
    if distance > 1000: risk += 25
    risk = min(100.0, risk)
    is_fraud = risk >= 60
    return {
        "is_fraudulent": is_fraud,
        "risk_score": risk,
        "confidence": 0.6 if not is_fraud else 0.75,
        "patterns": [p for p, cond in {
            "rapid_small_transactions": velocity > 5 and amount < 20,
            "geographic_impossibility": distance > 5000,
        }.items() if cond]
    }


def simple_esg(meta: Dict[str, Any]) -> Dict[str, float]:
    co2 = float(meta.get("co2_intensity", 0.4))  # lower better
    diversity = float(meta.get("diversity", 0.6))  # higher better
    transparency = float(meta.get("transparency", 0.7))
    e = max(0.0, 100 - co2 * 100)
    s = max(0.0, diversity * 100)
    g = max(0.0, transparency * 100)
    return {"e": e, "s": s, "g": g}


def simple_router(meta: Dict[str, Any], content: str) -> List[str]:
    c = content.lower()
    agents: List[str] = []
    if any(w in c for w in ["credit", "loan", "score"]):
        agents.append("credit-agent")
    if any(w in c for w in ["fraud", "suspicious", "anomaly"]):
        agents.append("fraud-agent")
    if any(w in c for w in ["esg", "environment", "sustainability", "governance"]):
        agents.append("esg-agent")
    if not agents:
        agents = ["credit-agent"]
    return agents
