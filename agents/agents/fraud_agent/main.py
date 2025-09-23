"""
Fraud Detection Agent
Specialized agent for transaction analysis, pattern detection, and fraud identification
"""

import os
import json
import logging
import random
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from enum import Enum

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from vertexai import generative_models
from vertexai.generative_models import GenerativeModel
import vertexai

# Configure logging
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Fraud Detection Agent",
    version="1.0.0",
    description="Specialized agent for fraud detection and transaction analysis"
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Vertex AI Configuration
VERTEX_AI_PROJECT = os.getenv("VERTEX_AI_PROJECT", "your-project-id")
VERTEX_AI_LOCATION = os.getenv("VERTEX_AI_LOCATION", "us-central1")
MODEL_NAME = os.getenv("FRAUD_MODEL_NAME", "gemini-1.5-flash")

# Initialize Vertex AI
vertexai.init(project=VERTEX_AI_PROJECT, location=VERTEX_AI_LOCATION)
model = GenerativeModel(MODEL_NAME)

# Data Models
class FraudRequest(BaseModel):
    id: str
    type: str
    content: str
    metadata: Dict[str, Any] = {}
    timestamp: datetime = Field(default_factory=datetime.now)

class TransactionAnalysis(BaseModel):
    transaction_id: str
    amount: float
    merchant: str
    location: str
    timestamp: datetime
    risk_score: float  # 0.0-1.0
    anomaly_flags: List[str]

class FraudRiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class FraudIndicators(BaseModel):
    velocity_check: bool  # Multiple transactions in short time
    location_anomaly: bool  # Transaction from unusual location
    amount_anomaly: bool  # Unusual transaction amount
    merchant_risk: bool  # High-risk merchant category
    pattern_match: bool  # Matches known fraud patterns
    device_fingerprint: bool  # Suspicious device characteristics

class FraudDetectionResult(BaseModel):
    is_fraudulent: bool
    confidence: float  # 0.0-1.0
    risk_level: FraudRiskLevel
    risk_score: float  # 0.0-100.0
    indicators: FraudIndicators
    patterns_detected: List[str]
    recommended_action: str
    explanation: str

class FraudResponse(BaseModel):
    request_id: str
    transaction_analysis: Optional[TransactionAnalysis] = None
    detection_result: FraudDetectionResult
    additional_checks: List[str] = []
    summary: str
    processing_time_ms: float
    timestamp: datetime = Field(default_factory=datetime.now)

# Fraud Detection Engine
class FraudDetector:
    """Main fraud detection engine"""
    
    def __init__(self):
        self.model = model
        self.known_patterns = [
            "card_present_followed_by_not_present",
            "rapid_small_transactions",
            "geographic_impossibility",
            "unusual_merchant_sequence",
            "dormant_account_sudden_activity"
        ]
    
    async def detect(self, request: FraudRequest) -> FraudResponse:
        """Perform fraud detection analysis"""
        
        start_time = datetime.now()
        
        # Analyze transaction
        transaction_analysis = await self._analyze_transaction(request)
        
        # Detect fraud indicators
        indicators = await self._check_fraud_indicators(request, transaction_analysis)
        
        # Pattern matching
        patterns = await self._detect_patterns(request, transaction_analysis)
        
        # Calculate risk score
        risk_score = self._calculate_risk_score(indicators, patterns)
        
        # Determine fraud status
        is_fraudulent, confidence = self._determine_fraud_status(risk_score, indicators, patterns)
        
        # Get risk level
        risk_level = self._get_risk_level(risk_score)
        
        # Generate explanation
        explanation = await self._generate_explanation(
            is_fraudulent, risk_score, indicators, patterns
        )
        
        # Determine recommended action
        recommended_action = self._get_recommended_action(is_fraudulent, risk_level)
        
        # Additional security checks
        additional_checks = self._suggest_additional_checks(risk_level, indicators)
        
        detection_result = FraudDetectionResult(
            is_fraudulent=is_fraudulent,
            confidence=confidence,
            risk_level=risk_level,
            risk_score=risk_score,
            indicators=indicators,
            patterns_detected=patterns,
            recommended_action=recommended_action,
            explanation=explanation
        )
        
        processing_time_ms = (datetime.now() - start_time).total_seconds() * 1000
        
        summary = f"{'FRAUD DETECTED' if is_fraudulent else 'Transaction appears legitimate'} - Risk: {risk_level.value.upper()} ({risk_score:.1f}/100)"
        
        return FraudResponse(
            request_id=request.id,
            transaction_analysis=transaction_analysis,
            detection_result=detection_result,
            additional_checks=additional_checks,
            summary=summary,
            processing_time_ms=processing_time_ms
        )
    
    async def _analyze_transaction(self, request: FraudRequest) -> Optional[TransactionAnalysis]:
        """Extract and analyze transaction details"""
        
        prompt = f"""Analyze the following transaction information and extract key details.

Request: {request.content}
Metadata: {json.dumps(request.metadata)}

Provide a JSON response with transaction details:
{{
    "transaction_id": "TXN123456",
    "amount": 150.00,
    "merchant": "Online Store XYZ",
    "location": "New York, USA",
    "timestamp": "2024-01-01T10:30:00",
    "risk_score": 0.35,
    "anomaly_flags": ["unusual_time", "new_merchant"]
}}

If transaction details cannot be extracted, return null."""

        try:
            response = self.model.generate_content(
                prompt,
                generation_config=generative_models.GenerationConfig(
                    temperature=0.2,
                    max_output_tokens=512,
                    response_mime_type="application/json"
                )
            )
            
            data = json.loads(response.text)
            
            if data and isinstance(data, dict):
                return TransactionAnalysis(
                    transaction_id=data.get("transaction_id", "UNKNOWN"),
                    amount=data.get("amount", 0.0),
                    merchant=data.get("merchant", "Unknown Merchant"),
                    location=data.get("location", "Unknown Location"),
                    timestamp=datetime.fromisoformat(data.get("timestamp", datetime.now().isoformat())),
                    risk_score=data.get("risk_score", 0.5),
                    anomaly_flags=data.get("anomaly_flags", [])
                )
            
            return None
            
        except Exception as e:
            logger.error(f"Transaction analysis failed: {e}")
            return None
    
    async def _check_fraud_indicators(
        self, 
        request: FraudRequest,
        transaction: Optional[TransactionAnalysis]
    ) -> FraudIndicators:
        """Check for various fraud indicators"""
        
        prompt = f"""Analyze the following information for fraud indicators.

Request: {request.content}
Metadata: {json.dumps(request.metadata)}
Transaction: {json.dumps(transaction.dict() if transaction else {}, default=str)}

Check for these fraud indicators and return true/false for each:
1. velocity_check: Multiple transactions in short time period
2. location_anomaly: Transaction from unusual or impossible location
3. amount_anomaly: Unusual transaction amount for this user/merchant
4. merchant_risk: High-risk merchant category
5. pattern_match: Matches known fraud patterns
6. device_fingerprint: Suspicious device or connection

Response format:
{{
    "velocity_check": false,
    "location_anomaly": true,
    "amount_anomaly": false,
    "merchant_risk": false,
    "pattern_match": true,
    "device_fingerprint": false
}}"""

        try:
            response = self.model.generate_content(
                prompt,
                generation_config=generative_models.GenerationConfig(
                    temperature=0.2,
                    max_output_tokens=256,
                    response_mime_type="application/json"
                )
            )
            
            data = json.loads(response.text)
            
            return FraudIndicators(
                velocity_check=data.get("velocity_check", False),
                location_anomaly=data.get("location_anomaly", False),
                amount_anomaly=data.get("amount_anomaly", False),
                merchant_risk=data.get("merchant_risk", False),
                pattern_match=data.get("pattern_match", False),
                device_fingerprint=data.get("device_fingerprint", False)
            )
            
        except Exception as e:
            logger.error(f"Indicator check failed: {e}")
            # Return conservative defaults
            return FraudIndicators(
                velocity_check=False,
                location_anomaly=False,
                amount_anomaly=False,
                merchant_risk=False,
                pattern_match=False,
                device_fingerprint=False
            )
    
    async def _detect_patterns(
        self,
        request: FraudRequest,
        transaction: Optional[TransactionAnalysis]
    ) -> List[str]:
        """Detect known fraud patterns"""
        
        prompt = f"""Analyze the following for known fraud patterns.

Request: {request.content}
Metadata: {json.dumps(request.metadata)}

Known fraud patterns to check:
- card_present_followed_by_not_present: In-person transaction followed quickly by online
- rapid_small_transactions: Multiple small transactions to test card
- geographic_impossibility: Transactions in different locations too quickly
- unusual_merchant_sequence: Unusual sequence of merchant types
- dormant_account_sudden_activity: Inactive account suddenly active

Return a JSON array of detected pattern names:
["pattern1", "pattern2"]"""

        try:
            response = self.model.generate_content(
                prompt,
                generation_config=generative_models.GenerationConfig(
                    temperature=0.2,
                    max_output_tokens=256,
                    response_mime_type="application/json"
                )
            )
            
            patterns = json.loads(response.text)
            
            if isinstance(patterns, list):
                return [p for p in patterns if p in self.known_patterns]
            
            return []
            
        except Exception as e:
            logger.error(f"Pattern detection failed: {e}")
            return []
    
    def _calculate_risk_score(
        self,
        indicators: FraudIndicators,
        patterns: List[str]
    ) -> float:
        """Calculate overall risk score (0-100)"""
        
        score = 0.0
        
        # Weight each indicator
        if indicators.velocity_check:
            score += 20
        if indicators.location_anomaly:
            score += 25
        if indicators.amount_anomaly:
            score += 15
        if indicators.merchant_risk:
            score += 15
        if indicators.pattern_match:
            score += 30
        if indicators.device_fingerprint:
            score += 20
        
        # Add pattern detection weight
        score += len(patterns) * 10
        
        # Normalize to 0-100
        return min(100.0, score)
    
    def _determine_fraud_status(
        self,
        risk_score: float,
        indicators: FraudIndicators,
        patterns: List[str]
    ) -> tuple[bool, float]:
        """Determine if transaction is fraudulent and confidence level"""
        
        # Critical indicators that strongly suggest fraud
        critical_indicators = [
            indicators.pattern_match,
            indicators.location_anomaly and indicators.velocity_check,
            len(patterns) >= 2
        ]
        
        if any(critical_indicators) or risk_score >= 70:
            is_fraudulent = True
            confidence = min(0.95, risk_score / 100 + 0.2)
        elif risk_score >= 50:
            is_fraudulent = True
            confidence = risk_score / 100
        else:
            is_fraudulent = False
            confidence = 1.0 - (risk_score / 100)
        
        return is_fraudulent, confidence
    
    def _get_risk_level(self, risk_score: float) -> FraudRiskLevel:
        """Determine risk level based on score"""
        
        if risk_score >= 80:
            return FraudRiskLevel.CRITICAL
        elif risk_score >= 60:
            return FraudRiskLevel.HIGH
        elif risk_score >= 30:
            return FraudRiskLevel.MEDIUM
        else:
            return FraudRiskLevel.LOW
    
    async def _generate_explanation(
        self,
        is_fraudulent: bool,
        risk_score: float,
        indicators: FraudIndicators,
        patterns: List[str]
    ) -> str:
        """Generate human-readable explanation"""
        
        explanations = []
        
        if is_fraudulent:
            explanations.append(f"Transaction flagged as fraudulent with {risk_score:.1f}% risk score.")
        else:
            explanations.append(f"Transaction appears legitimate with {risk_score:.1f}% risk score.")
        
        # Add indicator explanations
        if indicators.velocity_check:
            explanations.append("Multiple rapid transactions detected.")
        if indicators.location_anomaly:
            explanations.append("Transaction from unusual location.")
        if indicators.amount_anomaly:
            explanations.append("Unusual transaction amount detected.")
        if indicators.merchant_risk:
            explanations.append("High-risk merchant category.")
        if indicators.device_fingerprint:
            explanations.append("Suspicious device characteristics.")
        
        # Add pattern explanations
        if patterns:
            explanations.append(f"Fraud patterns detected: {', '.join(patterns)}.")
        
        return " ".join(explanations)
    
    def _get_recommended_action(
        self,
        is_fraudulent: bool,
        risk_level: FraudRiskLevel
    ) -> str:
        """Get recommended action based on detection results"""
        
        if is_fraudulent:
            if risk_level == FraudRiskLevel.CRITICAL:
                return "BLOCK - Immediate transaction denial and account review required"
            elif risk_level == FraudRiskLevel.HIGH:
                return "BLOCK - Transaction denied, customer verification required"
            else:
                return "REVIEW - Manual review required before processing"
        else:
            if risk_level == FraudRiskLevel.MEDIUM:
                return "MONITOR - Allow with enhanced monitoring"
            else:
                return "APPROVE - Transaction can proceed normally"
    
    def _suggest_additional_checks(
        self,
        risk_level: FraudRiskLevel,
        indicators: FraudIndicators
    ) -> List[str]:
        """Suggest additional security checks"""
        
        checks = []
        
        if risk_level in [FraudRiskLevel.HIGH, FraudRiskLevel.CRITICAL]:
            checks.append("Two-factor authentication")
            checks.append("Identity verification")
            checks.append("Account activity review")
        
        if indicators.device_fingerprint:
            checks.append("Device verification")
        
        if indicators.location_anomaly:
            checks.append("Location verification")
        
        if indicators.velocity_check:
            checks.append("Transaction history analysis")
        
        return checks

# Global detector instance
detector = FraudDetector()

# API Routes
@app.get("/")
async def root():
    return {
        "service": "Fraud Detection Agent",
        "version": "1.0.0",
        "status": "healthy",
        "capabilities": [
            "transaction_analysis",
            "pattern_detection",
            "anomaly_detection",
            "risk_scoring"
        ]
    }

@app.get("/health")
async def health():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

@app.post("/process")
async def process_request(request: FraudRequest):
    """Process a fraud detection request"""
    try:
        logger.info(f"Processing fraud detection request: {request.id}")
        result = await detector.detect(request)
        
        # Return simplified response for router compatibility
        return {
            "response": result.summary,
            "details": result.dict()
        }
        
    except Exception as e:
        logger.error(f"Processing error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/detect")
async def detect_fraud(request: FraudRequest):
    """Detailed fraud detection endpoint"""
    try:
        result = await detector.detect(request)
        return result
        
    except Exception as e:
        logger.error(f"Detection error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8082"))
    uvicorn.run(app, host="0.0.0.0", port=port)
