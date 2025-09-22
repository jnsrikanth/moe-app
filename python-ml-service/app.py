#!/usr/bin/env python3
# Standard-library-only HTTP server for local ML routing/agents
# Endpoints:
#  GET  /health
#  POST /v1/router/route
#  POST /v1/credit/analyze
#  POST /v1/fraud/analyze
#  POST /v1/esg/analyze

from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import time
import os
from urllib.parse import urlparse

PORT = int(os.environ.get("PY_LOCAL_PORT", "5055"))
MODEL_LABEL = os.environ.get("LOCAL_ML_LABEL", "mlp-local")

class Handler(BaseHTTPRequestHandler):
    server_version = "LocalML/1.0"

    def log_message(self, fmt, *args):
        # Quiet logs unless DEBUG=1
        if os.environ.get("DEBUG") == "1":
            super().log_message(fmt, *args)

    def _read_json(self):
        length = int(self.headers.get('Content-Length') or 0)
        raw = self.rfile.read(length) if length > 0 else b""
        if not raw:
            return {}
        try:
            return json.loads(raw.decode('utf-8'))
        except Exception:
            return {}

    def _write_json(self, obj, status=200):
        data = json.dumps(obj).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/health':
            self._write_json({"status": "ok", "engine": MODEL_LABEL, "time": time.time()})
        else:
            self._write_json({"error": "Not found"}, status=404)

    def do_POST(self):
        parsed = urlparse(self.path)
        body = self._read_json()
        t0 = time.time()

        if parsed.path == '/v1/router/route':
            req_type = str(body.get('type', '')).lower()
            selected = []
            if 'loan' in req_type or 'credit' in req_type:
                selected = ['credit-agent']
            elif 'fraud' in req_type or 'claim' in req_type:
                selected = ['fraud-agent']
            elif 'esg' in req_type or 'investment' in req_type:
                selected = ['esg-agent']
            else:
                selected = ['credit-agent', 'fraud-agent']
            self._write_json({
                "selected_agents": selected,
                "reasoning": f"python {MODEL_LABEL} routing",
                "processing_time_ms": int((time.time() - t0) * 1000)
            })
            return

        if parsed.path == '/v1/credit/analyze':
            data = body.get('request') or body
            income = float(data.get('annual_income', 70000) or 70000)
            debt = float(data.get('existing_debt', 15000) or 15000)
            history = int(data.get('credit_history_length', 5) or 5)
            utilization = float(data.get('utilization', 0.35) or 0.35)

            score = 700
            factors = []
            if utilization > 0.5:
                score -= 40; factors.append('High utilization')
            if debt > income * 0.5:
                score -= 50; factors.append('High DTI')
            if history < 2:
                score -= 20; factors.append('Short credit history')
            score = max(300, min(850, int(score)))

            risk = 'Low'
            if score < 600: risk = 'High'
            elif score < 680: risk = 'Medium'

            self._write_json({
                "score": score,
                "risk_level": risk,
                "key_factors": factors,
                "confidence": 0.85,
                "reasoning": f"Local {MODEL_LABEL} heuristics",
                "processing_time_ms": int((time.time() - t0) * 1000)
            })
            return

        if parsed.path == '/v1/fraud/analyze':
            data = body.get('request') or body
            amount = float(data.get('amount', 0) or 0)
            is_new_payee = bool(data.get('isNewPayee') or data.get('is_new_payee') or False)
            category = str(data.get('merchantCategory') or data.get('merchant_category') or '').lower()

            risk_indicators = []
            score = 0
            if amount > 5000:
                score += 30; risk_indicators.append('high_amount')
            if is_new_payee:
                score += 20; risk_indicators.append('new_payee')
            if category in {'gambling','crypto_exchange','wire_transfer'}:
                score += 25; risk_indicators.append('high_risk_merchant')
            score = min(100, score)

            level = 'Low'
            action = 'Approve'
            if score >= 70:
                level, action = 'Critical', 'Block'
            elif score >= 50:
                level, action = 'High', 'Review'
            elif score >= 30:
                level, action = 'Medium', 'Flag'

            self._write_json({
                "fraud_probability": score,
                "risk_level": level,
                "indicators": risk_indicators,
                "recommended_action": action,
                "confidence": 0.85,
                "reasoning": f"Local {MODEL_LABEL} heuristics",
                "processing_time_ms": int((time.time() - t0) * 1000)
            })
            return

        if parsed.path == '/v1/esg/analyze':
            data = body.get('request') or body
            # Simple synthetic scoring
            e = int(data.get('environmental_score', 65) or 65)
            s = int(data.get('social_score', 70) or 70)
            g = int(data.get('governance_score', 75) or 75)
            avg = (e + s + g) / 3
            rating = 'A' if avg >= 75 else 'B' if avg >= 60 else 'C'
            self._write_json({
                "environmental_score": e,
                "social_score": s,
                "governance_score": g,
                "overall_rating": rating,
                "confidence": 0.8,
                "key_findings": ["Local ESG heuristic analysis"],
                "reasoning": f"Local {MODEL_LABEL} heuristics",
                "processing_time_ms": int((time.time() - t0) * 1000)
            })
            return

        self._write_json({"error": "Not found"}, status=404)


def run():
    host = os.environ.get("PY_LOCAL_HOST", "127.0.0.1")
    httpd = HTTPServer((host, PORT), Handler)
    print(f"Local Python ML service listening on http://{host}:{PORT}  label={MODEL_LABEL}")
    httpd.serve_forever()

if __name__ == '__main__':
    run()
