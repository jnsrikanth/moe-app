"""
MoE Router - Main Orchestrator
Intelligent routing system for distributing requests to specialized agents
"""

import os
import json
import asyncio
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
from enum import Enum
from uuid import uuid4

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import httpx
import vertexai
from vertexai.generative_models import GenerativeModel

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

# Main Router Orchestrator
class RouterOrchestrator:
    """Main orchestrator for routing requests to agents"""
    
    def __init__(self, strategy: str = "llm"):
        self.strategy = self._get_strategy(strategy)
        self.active_requests: Dict[str, Any] = {}
        self.websocket_connections: List[WebSocket] = []
    
    def _get_strategy(self, strategy_name: str) -> RouterStrategy:
        if strategy_name == "llm":
            return LLMRouterStrategy()
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
        
        # Broadcast completion
        await self._broadcast_update("request_completed", {
            "request_id": request.id,
            "responses": responses
        })
        
        return {
            "request_id": request.id,
            "routing": routing_decision.dict(),
            "responses": responses
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
                ).dict()
                
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
                    json=request.dict()
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
            "data": data,
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
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

@app.get("/agents")
async def get_agents():
    """Get list of registered agents and their capabilities"""
    return AGENT_REGISTRY

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
