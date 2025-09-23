#!/usr/bin/env python3
"""
Offline trainer for MoE gating model (models/gating.joblib).

- Reads data/py_decisions.jsonl (DecisionStore) as weak supervision.
- Builds per-expert training rows using the same feature map as the router (request text + metadata + one-hot expert type).
- Label heuristic: 1 if final status Approved and the expert was selected; else 0.
- Trains a LogisticRegression classifier and saves to models/gating.joblib.

Run:
  PYTHONPATH=./agents \
  .venv/router/bin/python agents/moe_router/train_gating.py --data data/py_decisions.jsonl --out models/gating.joblib
"""
import argparse
import json
import os
from pathlib import Path
from typing import Any, Dict, List

import numpy as np  # type: ignore
from sklearn.linear_model import LogisticRegression  # type: ignore
from sklearn.utils import shuffle  # type: ignore
import joblib  # type: ignore

from agents.moe_router.main import AGENT_REGISTRY  # reuse types

DEFAULT_DATA = Path("data/py_decisions.jsonl")
DEFAULT_OUT = Path("models/gating.joblib")

FEATURE_KEYS = [
    "has_loan", "has_credit", "has_fraud", "has_esg",
    "dti", "util", "income", "amount",
]

EXPERT_TYPES = ["credit", "fraud", "esg"]


def base_features(sample: Dict[str, Any]) -> Dict[str, float]:
    # Sample schema: record from DecisionStore (router), includes agentResults and possibly request payload embedding in raw
    # We reconstruct approximate request features from agentResults raw fields if present.
    text_fields: List[str] = []
    try:
        for r in sample.get("agentResults", []) or []:
            raw = r.get("raw")
            if isinstance(raw, dict):
                text_fields.append(json.dumps(raw))
            elif isinstance(raw, str):
                text_fields.append(raw)
    except Exception:
        pass
    joined = " ".join(text_fields).lower()

    meta = {}  # Unknown here; decisions file may not contain original metadata
    feats = {
        "has_loan": float("loan" in joined),
        "has_credit": float("credit" in joined),
        "has_fraud": float("fraud" in joined or "claim" in joined or "suspicious" in joined),
        "has_esg": float("esg" in joined or "investment" in joined or "sustainability" in joined),
        "dti": float(meta.get("debt_to_income", meta.get("dti_mortgage", 0.0))),
        "util": float(meta.get("credit_utilization", 0.0)),
        "income": float(meta.get("annual_income", meta.get("annual_revenue", 0.0))) / 100000.0,
        "amount": float(meta.get("loan_amount", meta.get("amount", 0.0))) / 100000.0,
    }
    return feats


def build_dataset(lines: List[str]):
    X: List[List[float]] = []
    y: List[int] = []
    for line in lines:
        try:
            rec = json.loads(line)
        except Exception:
            continue
        final = (rec.get("final") or {})
        approved = 1 if str(final.get("status", "")).lower() == "approved" else 0
        feats = base_features(rec)
        fvec = [feats[k] for k in FEATURE_KEYS]
        selected = set(rec.get("assignedAgents") or [])
        # Build one row per known expert id (credit-agent, fraud-agent, esg-agent)
        for eid, meta in AGENT_REGISTRY.items():
            et = str(meta.get("type", "")).lower()
            onehot = [1.0 if et == "credit" else 0.0, 1.0 if et == "fraud" else 0.0, 1.0 if et == "esg" else 0.0]
            X.append([*fvec, *onehot])
            y.append(1 if (eid in selected and approved == 1) else 0)
    X, y = shuffle(np.array(X), np.array(y), random_state=42)
    return X, y


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", type=Path, default=DEFAULT_DATA)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = ap.parse_args()

    if not args.data.exists():
        print(f"No data file found at {args.data}")
        return

    lines = args.data.read_text("utf-8").splitlines()
    if not lines:
        print("No decision records to train from.")
        return

    X, y = build_dataset(lines)
    if X.shape[0] < 10:
        print("Insufficient samples (<10). Collect more decisions before training.")
        return

    clf = LogisticRegression(max_iter=500)
    clf.fit(X, y)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(clf, args.out)
    print(f"Saved gating model to {args.out} (n={X.shape[0]} samples)")


if __name__ == "__main__":
    main()