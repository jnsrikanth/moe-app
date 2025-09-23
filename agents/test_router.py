"""
Simple test version of MoE Router for local testing
This version works without Vertex AI credentials
"""

import os
import json
import asyncio
from datetime import datetime
from typing import List, Dict, Any
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import httpx

# Initialize FastAPI app
app = FastAPI(
    title="MoE Router Service (Test Mode)",
    version="1.0.0",
    description="Test version - uses mock responses instead of real AI"
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Agent Registry
AGENT_REGISTRY = {
    "credit-agent": {
        "id": "credit-agent",
        "name": "Credit Evaluation Agent",
        "type": "credit",
        "capabilities": ["credit_scoring", "risk_assessment", "loan_eligibility"],
        "endpoint": os.getenv("CREDIT_AGENT_URL", "http://localhost:8081")
    },
    "fraud-agent": {
        "id": "fraud-agent",
        "name": "Fraud Detection Agent",
        "type": "fraud",
        "capabilities": ["transaction_analysis", "pattern_detection", "anomaly_detection"],
        "endpoint": os.getenv("FRAUD_AGENT_URL", "http://localhost:8082")
    },
    "esg-agent": {
        "id": "esg-agent",
        "name": "ESG Analysis Agent",
        "type": "esg",
        "capabilities": ["environmental_impact", "social_compliance", "governance_assessment"],
        "endpoint": os.getenv("ESG_AGENT_URL", "http://localhost:8083")
    }
}

# Data Models
class AgentRequest(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    type: str
    content: str
    metadata: Dict[str, Any] = {}
    timestamp: datetime = Field(default_factory=datetime.now)

class RoutingDecision(BaseModel):
    request_id: str
    selected_agents: List[str]
    reasoning: str
    confidence: float

# Simple rule-based routing
async def route_request(request: AgentRequest) -> RoutingDecision:
    selected_agents = []
    reasoning = ""
    
    # Simple type-based routing
    request_type = request.type.lower()
    
    if "credit" in request_type:
        selected_agents = ["credit-agent"]
        reasoning = "Credit-related request routed to Credit Agent"
    elif "fraud" in request_type:
        selected_agents = ["fraud-agent"]
        reasoning = "Fraud-related request routed to Fraud Agent"
    elif "esg" in request_type or "environmental" in request_type:
        selected_agents = ["esg-agent"]
        reasoning = "ESG-related request routed to ESG Agent"
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
            selected_agents = ["credit-agent"]  # Default
        
        reasoning = f"Content analysis routed to: {', '.join(selected_agents)}"
    
    return RoutingDecision(
        request_id=request.id,
        selected_agents=selected_agents,
        reasoning=reasoning,
        confidence=0.85
    )

# Mock agent response for testing
async def mock_agent_response(request: AgentRequest, agent_id: str) -> Dict[str, Any]:
    """Generate mock response for testing"""
    
    responses = {
        "credit-agent": f"Credit analysis complete. Score: 720 (Good). Low risk profile detected for request.",
        "fraud-agent": f"No fraudulent patterns detected. Transaction appears legitimate with 95% confidence.",
        "esg-agent": f"ESG Rating: A (Score: 75/100). Strong environmental practices, good governance structure."
    }
    
    await asyncio.sleep(0.5)  # Simulate processing time
    
    return {
        "response": responses.get(agent_id, "Processing complete"),
        "agent_id": agent_id,
        "processing_time_ms": 500
    }

# API Routes
@app.get("/")
async def root():
    return {
        "service": "MoE Router (Test Mode)",
        "version": "1.0.0",
        "status": "healthy",
        "mode": "test",
        "agents": list(AGENT_REGISTRY.keys())
    }

@app.get("/health")
async def health():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

@app.get("/agents")
async def get_agents():
    return AGENT_REGISTRY

@app.post("/route")
async def handle_route(request: AgentRequest):
    """Route a request to appropriate agents"""
    
    # Get routing decision
    routing = await route_request(request)
    
    # Get mock responses from agents
    responses = {}
    for agent_id in routing.selected_agents:
        if agent_id in AGENT_REGISTRY:
            responses[agent_id] = await mock_agent_response(request, agent_id)
    
    return {
        "request_id": request.id,
        "routing": routing.dict(),
        "responses": responses
    }

@app.post("/test")
async def test_endpoint():
    """Test endpoint to verify service is working"""
    
    test_request = AgentRequest(
        type="credit",
        content="Check credit score for user",
        metadata={"test": True}
    )
    
    result = await handle_route(test_request)
    return {
        "message": "Test successful",
        "result": result
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8080"))
    print(f"Starting MoE Router (Test Mode) on port {port}")
    print(f"Access the API at http://localhost:{port}")
    print(f"API Documentation at http://localhost:{port}/docs")
    uvicorn.run(app, host="0.0.0.0", port=port)
