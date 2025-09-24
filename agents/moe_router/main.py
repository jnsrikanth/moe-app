"""
MoE Router - Main Orchestrator
Intelligent routing system for distributing requests to specialized agents
"""

import os
import json
import asyncio
import logging
import re
from typing import List, Dict, Any, Optional
from datetime import datetime
from enum import Enum
from uuid import uuid4

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from fastapi.encoders import jsonable_encoder
import httpx

# Offline toggles
import os
USE_VERTEX = os.getenv("DISABLE_VERTEX", "0") != "1"
USE_ML = os.getenv("USE_ML", "0") == "1"

if USE_VERTEX:
    try:
        import vertexai
        from vertexai.generative_models import GenerativeModel
    except Exception:
        USE_VERTEX = False
        vertexai = None  # type: ignore
        GenerativeModel = None  # type: ignore
else:
    vertexai = None  # type: ignore
    GenerativeModel = None  # type: ignore

# ML helper
try:
    from common.ml import load_model, simple_router
except Exception:
    load_model = None  # type: ignore
    simple_router = None  # type: ignore

# Optional local model (joblib) for gating (offline)
try:
    import joblib  # type: ignore
except Exception:
    joblib = None  # type: ignore

# Lightweight file-backed bandit and decisions stores (offline)
from pathlib import Path

DATA_DIR = Path(os.getenv("DATA_DIR", "data")).resolve()
DATA_DIR.mkdir(parents=True, exist_ok=True)

class BanditStore:
    def __init__(self, file: Path = DATA_DIR / "py_bandit.json"):
        self.file = file
        self.state: Dict[str, Dict[str, float]] = {}
        try:
            if self.file.exists():
                self.state = json.loads(self.file.read_text("utf-8"))
        except Exception:
            self.state = {}

    def _ensure(self, agent_id: str):
        if agent_id not in self.state:
            self.state[agent_id] = {"n": 0.0, "reward": 0.0}

    def ucb(self, agent_id: str, total_n: float) -> float:
        self._ensure(agent_id)
        n = max(1.0, float(self.state[agent_id]["n"]))
        avg = float(self.state[agent_id]["reward"]) / n
        bonus = (2.0 * (max(1.0, total_n)) ** 0.5) / (n ** 0.5)
        return avg + bonus

    def update(self, agent_id: str, reward: float):
        self._ensure(agent_id)
        self.state[agent_id]["n"] += 1.0
        self.state[agent_id]["reward"] += float(reward)
        try:
            self.file.write_text(json.dumps(self.state, indent=2), encoding="utf-8")
        except Exception:
            pass

class DecisionStore:
    def __init__(self, file: Path = DATA_DIR / "py_decisions.jsonl"):
        self.file = file
        self.file.parent.mkdir(parents=True, exist_ok=True)
        if not self.file.exists():
            try:
                self.file.write_text("", encoding="utf-8")
            except Exception:
                pass

    def append(self, record: Dict[str, Any]):
        try:
            with self.file.open("a", encoding="utf-8") as f:
                f.write(json.dumps(record, ensure_ascii=False) + "\n")
        except Exception:
            pass

bandit_store = BanditStore()
decision_store = DecisionStore()

# Configure logging
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="MoE Router Service",
    version="1.0.0",
    description="Intelligent request routing for mixture of expert agents"
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
VERTEX_AI_PROJECT = os.getenv("VERTEX_AI_PROJECT", "your-project-id")
VERTEX_AI_LOCATION = os.getenv("VERTEX_AI_LOCATION", "us-central1")
MODEL_NAME = os.getenv("MODEL_NAME", "gemini-1.5-flash")

# Agent Registry Configuration
AGENT_REGISTRY = {
    "credit-agent": {
        "id": "credit-agent",
        "name": "Credit Evaluation Agent",
        "type": "credit",
        "capabilities": ["credit_scoring", "risk_assessment", "loan_eligibility"],
        "endpoint": os.getenv("CREDIT_AGENT_URL", "http://localhost:8081"),
        "model": "gemini-1.5-flash"
    },
    "fraud-agent": {
        "id": "fraud-agent",
        "name": "Fraud Detection Agent",
        "type": "fraud",
        "capabilities": ["transaction_analysis", "pattern_detection", "anomaly_detection"],
        "endpoint": os.getenv("FRAUD_AGENT_URL", "http://localhost:8082"),
        "model": "gemini-1.5-flash"
    },
    "esg-agent": {
        "id": "esg-agent",
        "name": "ESG Analysis Agent",
        "type": "esg",
        "capabilities": ["environmental_impact", "social_compliance", "governance_assessment"],
        "endpoint": os.getenv("ESG_AGENT_URL", "http://localhost:8083"),
        "model": "gemini-1.5-pro"
    }
}

# Request/Response Models
class RequestType(str, Enum):
    CREDIT = "credit"
    FRAUD = "fraud"
    ESG = "esg"
    GENERAL = "general"

class AgentRequest(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    type: RequestType
    content: str
    metadata: Dict[str, Any] = {}
    timestamp: datetime = Field(default_factory=datetime.now)

class RoutingDecision(BaseModel):
    request_id: str
    selected_agents: List[str]
    reasoning: str
    confidence: float
    timestamp: datetime = Field(default_factory=datetime.now)

class AgentResponse(BaseModel):
    request_id: str
    agent_id: str
    response: str
    metadata: Dict[str, Any] = {}
    processing_time_ms: float
    timestamp: datetime = Field(default_factory=datetime.now)

# Router Strategy Interface
class RouterStrategy:
    """Base class for routing strategies"""
    
    async def route(self, request: AgentRequest) -> RoutingDecision:
        raise NotImplementedError

# LLM-based Router Strategy
class LLMRouterStrategy(RouterStrategy):
    """Uses Vertex AI to make intelligent routing decisions"""
    
    def __init__(self):
        # Initialize Vertex AI
        if not (USE_VERTEX and vertexai and GenerativeModel):
            raise RuntimeError("Vertex AI not available")
        vertexai.init(project=VERTEX_AI_PROJECT, location=VERTEX_AI_LOCATION)
        self.model = GenerativeModel(MODEL_NAME)
    
    async def route(self, request: AgentRequest) -> RoutingDecision:
        # Get current agent loads (simulated for now)
        agent_loads = self._get_agent_loads()
        
        # Create routing prompt
        prompt = self._create_routing_prompt(request, agent_loads)
        
        try:
            # Generate routing decision using Vertex AI
            response = await asyncio.to_thread(
                self.model.generate_content,
                prompt
            )
            
            # Parse response
            decision_data = json.loads(response.text)
            
            return RoutingDecision(
                request_id=request.id,
                selected_agents=decision_data.get("selected_agents", []),
                reasoning=decision_data.get("reasoning", ""),
                confidence=decision_data.get("confidence", 0.8)
            )
            
        except Exception as e:
            logger.error(f"LLM routing failed: {e}")
            # Fallback to rule-based routing
            return await RulesRouterStrategy().route(request)
    
    def _create_routing_prompt(self, request: AgentRequest, agent_loads: Dict) -> str:
        agents_info = "\n".join([
            f"- {agent['id']}: {agent['capabilities']}, Load: {agent_loads[agent['id']]}%"
            for agent in AGENT_REGISTRY.values()
        ])
        
        return f"""You are a MoE (Mixture of Experts) routing agent. Analyze this request and decide which expert agents should handle it.

Request Type: {request.type}
Request Content: {request.content}
Request Metadata: {json.dumps(request.metadata)}

Available Expert Agents:
{agents_info}

Decision Criteria:
- Agent Specialization: 35%
- Current Load: 40%
- Response Time Requirements: 25%

Respond with JSON only:
{{
    "selected_agents": ["agent-id-1", "agent-id-2"],
    "reasoning": "Brief explanation of routing decision",
    "confidence": 0.95
}}"""
    
    def _get_agent_loads(self) -> Dict[str, float]:
        # Simulated agent loads - in production, query actual agent metrics
        return {
            agent_id: 30 + (hash(agent_id) % 40)
            for agent_id in AGENT_REGISTRY.keys()
        }

# ML-based Router Strategy
class MLRouterStrategy(RouterStrategy):
    def __init__(self):
        self.ml_model = None
        if USE_ML and load_model:
            path = os.getenv("ROUTER_MODEL_PATH", "models/router.joblib")
            self.ml_model = load_model(path, kind="router")

    async def route(self, request: AgentRequest) -> RoutingDecision:
        # basic ML/heuristic routing
        selected_agents = (
            simple_router(request.metadata, request.content) if simple_router else ["credit-agent"]
        )
        return RoutingDecision(
            request_id=request.id,
            selected_agents=selected_agents,
            reasoning="ML/heuristic routing",
            confidence=0.8,
        )

# Rules-based Router Strategy
class RulesRouterStrategy(RouterStrategy):
    """Simple rule-based routing for fallback"""
    
    async def route(self, request: AgentRequest) -> RoutingDecision:
        selected_agents = []
        reasoning = ""
        
        # Simple type-based routing
        if request.type == RequestType.CREDIT:
            selected_agents = ["credit-agent"]
            reasoning = "Credit request routed to credit specialist"
        elif request.type == RequestType.FRAUD:
            selected_agents = ["fraud-agent"]
            reasoning = "Fraud detection request routed to fraud specialist"
        elif request.type == RequestType.ESG:
            selected_agents = ["esg-agent"]
            reasoning = "ESG request routed to ESG specialist"
        else:
            # For general requests, analyze content
            content_lower = request.content.lower()
            if any(word in content_lower for word in ["credit", "loan", "score"]):
                selected_agents.append("credit-agent")
            if any(word in content_lower for word in ["fraud", "suspicious", "anomaly"]):
                selected_agents.append("fraud-agent")
            if any(word in content_lower for word in ["esg", "environmental", "sustainability"]):
                selected_agents.append("esg-agent")
            
            if not selected_agents:
                selected_agents = ["credit-agent"]  # Default fallback
            
            reasoning = f"Content analysis routed to: {', '.join(selected_agents)}"
        
        return RoutingDecision(
            request_id=request.id,
            selected_agents=selected_agents,
            reasoning=reasoning,
            confidence=0.75
        )

class MoEGatingRouterStrategy(RouterStrategy):
    """True MoE gating with top-k selection.
    Offline-friendly: uses rules + bandit; optionally a local joblib model (models/gating.joblib).
    """
    def __init__(self, top_k: int = 2, multi_margin: float = 0.15):
        self.top_k = max(1, top_k)
        self.multi_margin = max(0.0, float(multi_margin))
        self.model = None
        model_path = os.getenv("ROUTER_MODEL_PATH", "models/gating.joblib")
        if joblib and os.path.exists(model_path):
            try:
                self.model = joblib.load(model_path)
            except Exception:
                self.model = None

    def _base_features(self, request: AgentRequest) -> Dict[str, float]:
        text = f"{request.type} {request.content}".lower()
        meta = request.metadata or {}
        feats: Dict[str, float] = {
            "has_loan": float("loan" in text),
            "has_credit": float("credit" in text),
            "has_fraud": float("fraud" in text or "claim" in text or "suspicious" in text),
            "has_esg": float("esg" in text or "investment" in text or "sustainability" in text),
            # common numeric metadata, normalized lightly
            "dti": float(meta.get("debt_to_income", meta.get("dti_mortgage", 0.0))),
            "util": float(meta.get("credit_utilization", 0.0)),
            "income": float(meta.get("annual_income", meta.get("annual_revenue", 0.0))) / 100000.0,
            "amount": float(meta.get("loan_amount", meta.get("amount", 0.0))) / 100000.0,
        }
        return feats

    def _expert_score(self, expert_id: str, feats: Dict[str, float], base: float) -> float:
        # Bandit UCB adjustment
        total_n = sum(v.get("n", 0.0) for v in bandit_store.state.values()) + 1.0
        ucb = bandit_store.ucb(expert_id, total_n)
        return base + 0.1 * ucb

    async def route(self, request: AgentRequest) -> RoutingDecision:
        # Gather candidates from registry
        candidates = list(AGENT_REGISTRY.keys())
        feats = self._base_features(request)

        # Heuristic base by matching specialization
        base_scores: Dict[str, float] = {}
        for e in candidates:
            et = AGENT_REGISTRY[e]["type"]
            if et == "credit":
                base = 1.0 * (feats["has_loan"] + feats["has_credit"] + (1.0 - min(1.0, feats["dti"])) + (1.0 - min(1.0, feats["util"])) )
            elif et == "fraud":
                base = 1.0 * (feats["has_fraud"] + min(1.0, feats["amount"]))
            elif et == "esg":
                base = 1.0 * (feats["has_esg"] + 0.5)
            else:
                base = 0.5
            base_scores[e] = base

        # Optional local model adjustment (if present)
        if self.model is not None:
            try:
                import numpy as np  # type: ignore
                X = []
                keys = sorted(feats.keys())
                for e in candidates:
                    et = AGENT_REGISTRY[e]["type"]
                    row = [feats[k] for k in keys]
                    # simple one-hot for expert type appended
                    row.extend([
                        1.0 if et == "credit" else 0.0,
                        1.0 if et == "fraud" else 0.0,
                        1.0 if et == "esg" else 0.0,
                    ])
                    X.append(row)
                P = self.model.predict_proba(np.array(X))
                # If binary classifier, use column 1; if multiclass, take max prob as boost
                for i, e in enumerate(candidates):
                    boost = float(P[i][1]) if P.shape[1] > 1 else float(P[i][0])
                    base_scores[e] += 0.5 * boost
            except Exception:
                pass

        # Bandit adjustment and selection
        scored = [(e, self._expert_score(e, feats, base_scores[e])) for e in candidates]
        scored.sort(key=lambda t: t[1], reverse=True)
        if scored:
            top_score = scored[0][1]
            selected = [e for e, s in scored if (top_score - s) <= self.multi_margin][: self.top_k]
        else:
            selected = []
        reasoning = f"MoE gating: top-{self.top_k} within margin {self.multi_margin:.2f} by rules+bandit{' + model' if self.model is not None else ''}"
        return RoutingDecision(request_id=request.id, selected_agents=selected or [candidates[0]] if candidates else [], reasoning=reasoning, confidence=0.85)


def compute_final_decision(responses: Dict[str, Any]) -> Dict[str, str]:
    # Parse agent responses looking for structured hints
    # Ensure datetimes and other types are JSON-serializable
    safe = jsonable_encoder(responses)
    joined = json.dumps(safe).lower()
    if "final decision" in joined and ("approve" in joined or "approved" in joined):
        return {"status": "Approved", "rationale": "Explicit approval in agent outputs."}
    if "decline" in joined or "rejected" in joined:
        return {"status": "Declined", "rationale": "Explicit decline in agent outputs."}

    # Heuristics similar to TS runtime
    fraud_prob = None
    credit_risk = None
    credit_score = None

    # Scan per-agent details
    try:
        for aid, payload in responses.items():
            text = json.dumps(payload)
            # credit
            m = re.search(r"\"credit_score\"\s*:\s*(\d{3})", text)
            if m:
                credit_score = int(m.group(1))
            m2 = re.search(r"\"risk_level\"\s*:\s*\"(High|Medium|Low)\"", text, re.IGNORECASE)
            if m2:
                credit_risk = m2.group(1)
            # fraud
            m3 = re.search(r"(fraud_probability|risk_score)\"?\s*:\s*(\d+(?:\.\d+)?)", text)
            if m3:
                val = float(m3.group(2))
                fraud_prob = val/100.0 if val > 1.0 else val
    except Exception:
        pass

    # thresholds
    if (fraud_prob is not None and fraud_prob >= 0.6) or (credit_risk and credit_risk.lower()=="high") or (credit_score is not None and credit_score < 600):
        reasons = []
        if fraud_prob is not None: reasons.append(f"Fraud probability {int(round(fraud_prob*100))}%")
        if credit_risk: reasons.append(f"Credit risk {credit_risk}")
        if credit_score is not None: reasons.append(f"Credit score {credit_score}")
        return {"status": "Declined", "rationale": "; ".join(reasons) or "Risk thresholds not met."}

    reasons = []
    if fraud_prob is not None: reasons.append(f"Fraud probability {int(round(fraud_prob*100))}%")
    if credit_risk: reasons.append(f"Credit risk {credit_risk}")
    if credit_score is not None: reasons.append(f"Credit score {credit_score}")
    return {"status": "Approved", "rationale": "; ".join(reasons) or "Heuristics indicate acceptable risk."}

# Router config store (file-backed)
class RouterConfigStore:
    def __init__(self, file: Path = DATA_DIR / "py_router_config.json"):
        self.file = file
        self.data = {
            "engine": os.getenv("ROUTER_STRATEGY", "rules"),
            "moe_top_k": int(os.getenv("MOE_TOP_K", "2")),
            "moe_mode": os.getenv("MOE_MODE", "balanced"),  # pure | balanced | minimal
            "multi_margin": float(os.getenv("MOE_MULTI_MARGIN", "0.15")),
        }
        try:
            if self.file.exists():
                self.data.update(json.loads(self.file.read_text("utf-8")))
        except Exception:
            pass

    def save(self):
        try:
            self.file.write_text(json.dumps(self.data, indent=2), encoding="utf-8")
        except Exception:
            pass

router_config = RouterConfigStore()

# Main Router Orchestrator
class RouterOrchestrator:
    """Main orchestrator for routing requests to agents"""
    
    def __init__(self, strategy: str = "llm"):
        self.strategy_name = strategy
        self.strategy = self._get_strategy(strategy)
        self.active_requests: Dict[str, Any] = {}
        self.websocket_connections: List[WebSocket] = []
    
    def set_strategy(self, name: str):
        self.strategy_name = name
        self.strategy = self._get_strategy(name)

    def update_config(self, data: Dict[str, Any]):
        # Update store and strategy live
        router_config.data.update(data or {})
        # Derive defaults by mode if provided
        mode = router_config.data.get("moe_mode", "balanced")
        if router_config.data.get("engine") in ("moe", "gating"):
            if mode == "pure":
                router_config.data["moe_top_k"] = max(2, int(router_config.data.get("moe_top_k", 3)))
                router_config.data["multi_margin"] = max(0.2, float(router_config.data.get("multi_margin", 0.25)))
            elif mode == "minimal":
                router_config.data["moe_top_k"] = 1
                router_config.data["multi_margin"] = 0.0
            else:
                router_config.data["moe_top_k"] = max(2, int(router_config.data.get("moe_top_k", 2)))
                router_config.data["multi_margin"] = max(0.1, float(router_config.data.get("multi_margin", 0.15)))
        router_config.save()
        self.set_strategy(str(router_config.data.get("engine", self.strategy_name)))
    
    def _get_strategy(self, strategy_name: str) -> RouterStrategy:
        name = (strategy_name or "").lower()
        if name == "llm":
            try:
                return LLMRouterStrategy()
            except Exception:
                return RulesRouterStrategy()
        elif name == "ml":
            return MLRouterStrategy()
        elif name in ("moe", "gating"):
            top_k = int(router_config.data.get("moe_top_k", 2))
            margin = float(router_config.data.get("multi_margin", 0.15))
            return MoEGatingRouterStrategy(top_k=top_k, multi_margin=margin)
        else:
            return RulesRouterStrategy()
    
    async def process_request(self, request: AgentRequest) -> Dict[str, Any]:
        """Process a request through the MoE system"""
        
        # Route the request
        routing_decision = await self.strategy.route(request)
        logger.info(f"Routing decision for {request.id}: {routing_decision.selected_agents}")
        
        # Store active request
        self.active_requests[request.id] = {
            "request": request,
            "routing": routing_decision,
            "responses": {},
            "status": "processing"
        }
        
        # Broadcast routing decision via WebSocket
        await self._broadcast_update("routing_decision", routing_decision.dict())
        
        # Send to selected agents
        responses = await self._send_to_agents(request, routing_decision.selected_agents)
        
        # Update request status
        self.active_requests[request.id]["responses"] = responses
        self.active_requests[request.id]["status"] = "completed"

        # Compute final decision and persist
        final = compute_final_decision(responses)
        try:
            decision_store.append({
                "id": str(uuid4()),
                "requestId": request.id,
                "type": request.type,
                "assignedAgents": routing_decision.selected_agents,
                "routing": {"engine": os.getenv("ROUTER_STRATEGY", "rules"), "reasoning": routing_decision.reasoning},
                "agentResults": [{"agentId": k, "raw": v} for k, v in responses.items()],
                "final": final,
                "createdAt": datetime.utcnow().isoformat()+"Z",
            })
            # Simple bandit reward: +1 for approval, 0 for decline
            reward = 1.0 if final.get("status") == "Approved" else 0.0
            for aid in routing_decision.selected_agents:
                bandit_store.update(aid, reward)
        except Exception:
            pass
        
        # Broadcast completion
        await self._broadcast_update("request_completed", {
            "request_id": request.id,
            "responses": responses,
            "final": final,
        })
        
        return {
            "request_id": request.id,
            "routing": routing_decision.dict(),
            "responses": responses,
            "final": final,
        }
    
    async def _send_to_agents(self, request: AgentRequest, agent_ids: List[str]) -> Dict[str, Any]:
        """Send request to selected agents and collect responses"""
        
        responses = {}
        tasks = []
        
        for agent_id in agent_ids:
            if agent_id in AGENT_REGISTRY:
                agent = AGENT_REGISTRY[agent_id]
                task = self._call_agent(request, agent)
                tasks.append((agent_id, task))
        
        # Execute all agent calls concurrently
        for agent_id, task in tasks:
            try:
                start_time = datetime.now()
                response = await task
                processing_time_ms = (datetime.now() - start_time).total_seconds() * 1000
                
responses[agent_id] = AgentResponse(
                    request_id=request.id,
                    agent_id=agent_id,
                    response=response,
                    processing_time_ms=processing_time_ms
                ).model_dump(mode="json")
                
            except Exception as e:
                logger.error(f"Agent {agent_id} failed: {e}")
                responses[agent_id] = {
                    "error": str(e),
                    "agent_id": agent_id
                }
        
        return responses
    
    async def _call_agent(self, request: AgentRequest, agent: Dict) -> str:
        """Call an individual agent endpoint"""
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.post(
                    f"{agent['endpoint']}/process",
                    json=jsonable_encoder(request)
                )
                response.raise_for_status()
                return response.json().get("response", "")
            except httpx.TimeoutException:
                raise Exception(f"Agent {agent['id']} timed out")
            except Exception as e:
                raise Exception(f"Agent {agent['id']} error: {e}")
    
    async def _broadcast_update(self, event_type: str, data: Any):
        """Broadcast updates to all connected WebSocket clients"""
        
        message = json.dumps({
            "type": event_type,
            "data": jsonable_encoder(data),
            "timestamp": datetime.now().isoformat()
        })
        
        for connection in self.websocket_connections:
            try:
                await connection.send_text(message)
            except:
                # Remove dead connections
                self.websocket_connections.remove(connection)

# Global orchestrator instance
orchestrator = RouterOrchestrator(strategy=os.getenv("ROUTER_STRATEGY", "llm"))

# API Routes
@app.get("/")
async def root():
    return {
        "service": "MoE Router",
        "version": "1.0.0",
        "status": "healthy",
        "agents": list(AGENT_REGISTRY.keys())
    }

@app.get("/health")
async def health():
    return {"status": "healthy", "timestamp": datetime.now().isoformat(), "router": router_config.data}

@app.get("/router/config")
async def get_router_config():
    return router_config.data

@app.post("/router/config")
async def set_router_config(payload: Dict[str, Any]):
    try:
        eng = str(payload.get("engine", router_config.data.get("engine", "rules"))).lower()
        top_k = int(payload.get("moe_top_k", router_config.data.get("moe_top_k", 2)))
        mode = str(payload.get("moe_mode", router_config.data.get("moe_mode", "balanced"))).lower()
        margin = float(payload.get("multi_margin", router_config.data.get("multi_margin", 0.15)))
        router_config.data.update({"engine": eng, "moe_top_k": top_k, "moe_mode": mode, "multi_margin": margin})
        orchestrator.update_config(router_config.data)
        return router_config.data
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/agents")
async def get_agents():
    """Get list of registered agents and their capabilities"""
    return AGENT_REGISTRY

@app.get("/decisions")
async def list_decisions(limit: int = 50):
    """List recent decisions from the local decision store (JSONL)."""
    file = decision_store.file
    out = []
    try:
        if file.exists():
            lines = file.read_text("utf-8").splitlines()
            for line in lines[-max(1, min(500, limit)):]:
                try:
                    out.append(json.loads(line))
                except Exception:
                    continue
    except Exception:
        pass
    return out

@app.get("/decisions/{request_id}")
async def get_decision(request_id: str):
    """Fetch a single decision by request id from the JSONL store."""
    file = decision_store.file
    try:
        if file.exists():
            for line in reversed(file.read_text("utf-8").splitlines()):
                try:
                    obj = json.loads(line)
                    if obj.get("requestId") == request_id:
                        return obj
                except Exception:
                    continue
    except Exception:
        pass
    raise HTTPException(status_code=404, detail="Decision not found")

@app.post("/route")
async def route_request(request: AgentRequest):
    """Route a request to appropriate agents"""
    try:
        result = await orchestrator.process_request(request)
        return result
    except Exception as e:
        logger.error(f"Routing error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/requests/{request_id}")
async def get_request_status(request_id: str):
    """Get status of a specific request"""
    if request_id in orchestrator.active_requests:
        return orchestrator.active_requests[request_id]
    else:
        raise HTTPException(status_code=404, detail="Request not found")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time updates"""
    await websocket.accept()
    orchestrator.websocket_connections.append(websocket)
    
    try:
        while True:
            # Keep connection alive and handle incoming messages
            data = await websocket.receive_text()
            # Process any client messages if needed
            await websocket.send_text(json.dumps({
                "type": "pong",
                "timestamp": datetime.now().isoformat()
            }))
    except WebSocketDisconnect:
        orchestrator.websocket_connections.remove(websocket)

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8080"))
    uvicorn.run(app, host="0.0.0.0", port=port)
