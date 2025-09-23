"""
Credit Evaluation Agent
Specialized agent for credit scoring, risk assessment, and loan eligibility
"""

import os
import json
import logging
from typing import Dict, Any, Optional
from datetime import datetime
from enum import Enum

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import vertexai
from vertexai.generative_models import GenerativeModel

# Configure logging
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Credit Evaluation Agent",
    version="1.0.0",
    description="Specialized agent for credit risk assessment and scoring"
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
MODEL_NAME = os.getenv("CREDIT_MODEL_NAME", "gemini-1.5-flash")

# Initialize Vertex AI
vertexai.init(project=VERTEX_AI_PROJECT, location=VERTEX_AI_LOCATION)
model = GenerativeModel(MODEL_NAME)

# Data Models
class CreditRequest(BaseModel):
    id: str
    type: str
    content: str
    metadata: Dict[str, Any] = {}
    timestamp: datetime = Field(default_factory=datetime.now)

class CreditScore(BaseModel):
    score: int  # 300-850 range
    rating: str  # Excellent, Good, Fair, Poor
    confidence: float
    factors: list[str]

class RiskAssessment(BaseModel):
    risk_level: str  # Low, Medium, High, Very High
    probability_of_default: float
    risk_factors: list[str]
    recommendations: list[str]

class LoanEligibility(BaseModel):
    eligible: bool
    max_loan_amount: float
    interest_rate: float
    terms: list[int]  # Available terms in months
    conditions: list[str]

class CreditResponse(BaseModel):
    request_id: str
    credit_score: Optional[CreditScore] = None
    risk_assessment: Optional[RiskAssessment] = None
    loan_eligibility: Optional[LoanEligibility] = None
    summary: str
    processing_time_ms: float
    timestamp: datetime = Field(default_factory=datetime.now)

# Credit Analysis Engine
class CreditAnalyzer:
    """Main credit analysis engine"""
    
    def __init__(self):
        self.model = model
        
    async def analyze(self, request: CreditRequest) -> CreditResponse:
        """Perform comprehensive credit analysis"""
        
        start_time = datetime.now()
        
        # Extract relevant information from request
        analysis_type = self._determine_analysis_type(request)
        
        # Perform appropriate analysis
        if analysis_type == "comprehensive":
            credit_score = await self._calculate_credit_score(request)
            risk_assessment = await self._assess_risk(request, credit_score)
            loan_eligibility = await self._check_loan_eligibility(request, credit_score, risk_assessment)
            summary = await self._generate_summary(credit_score, risk_assessment, loan_eligibility)
        elif analysis_type == "score_only":
            credit_score = await self._calculate_credit_score(request)
            risk_assessment = None
            loan_eligibility = None
            summary = f"Credit score calculated: {credit_score.score} ({credit_score.rating})"
        elif analysis_type == "risk_only":
            credit_score = None
            risk_assessment = await self._assess_risk(request, None)
            loan_eligibility = None
            summary = f"Risk assessment complete: {risk_assessment.risk_level} risk level"
        else:
            credit_score = None
            risk_assessment = None
            loan_eligibility = await self._check_loan_eligibility(request, None, None)
            summary = f"Loan eligibility: {'Approved' if loan_eligibility.eligible else 'Not approved'}"
        
        processing_time_ms = (datetime.now() - start_time).total_seconds() * 1000
        
        return CreditResponse(
            request_id=request.id,
            credit_score=credit_score,
            risk_assessment=risk_assessment,
            loan_eligibility=loan_eligibility,
            summary=summary,
            processing_time_ms=processing_time_ms
        )
    
    def _determine_analysis_type(self, request: CreditRequest) -> str:
        """Determine what type of analysis to perform"""
        
        content_lower = request.content.lower()
        
        if "comprehensive" in content_lower or "full" in content_lower:
            return "comprehensive"
        elif "score" in content_lower:
            return "score_only"
        elif "risk" in content_lower:
            return "risk_only"
        elif "loan" in content_lower or "eligibility" in content_lower:
            return "eligibility_only"
        else:
            return "comprehensive"  # Default to comprehensive
    
    async def _calculate_credit_score(self, request: CreditRequest) -> CreditScore:
        """Calculate credit score using AI analysis"""
        
        prompt = f"""You are a credit scoring expert. Analyze the following information and provide a credit score assessment.

Request: {request.content}
Metadata: {json.dumps(request.metadata)}

Provide a JSON response with:
1. A credit score between 300-850
2. A rating (Excellent: 750+, Good: 700-749, Fair: 650-699, Poor: <650)
3. Confidence level (0.0-1.0)
4. Key factors affecting the score

Response format:
{{
    "score": 720,
    "rating": "Good",
    "confidence": 0.85,
    "factors": ["Payment history", "Credit utilization", "Length of credit history"]
}}"""

        try:
            response = self.model.generate_content(prompt)
            
            data = json.loads(response.text)
            
            return CreditScore(
                score=data.get("score", 650),
                rating=data.get("rating", "Fair"),
                confidence=data.get("confidence", 0.7),
                factors=data.get("factors", ["Insufficient data"])
            )
            
        except Exception as e:
            logger.error(f"Credit score calculation failed: {e}")
            # Return default score on error
            return CreditScore(
                score=650,
                rating="Fair",
                confidence=0.5,
                factors=["Error in calculation - using default values"]
            )
    
    async def _assess_risk(self, request: CreditRequest, credit_score: Optional[CreditScore]) -> RiskAssessment:
        """Assess credit risk"""
        
        score_info = f"Credit Score: {credit_score.score}" if credit_score else "No credit score available"
        
        prompt = f"""You are a credit risk assessment expert. Analyze the following information and provide a risk assessment.

Request: {request.content}
Metadata: {json.dumps(request.metadata)}
{score_info}

Provide a JSON response with:
1. Risk level (Low, Medium, High, Very High)
2. Probability of default (0.0-1.0)
3. Risk factors
4. Recommendations to mitigate risk

Response format:
{{
    "risk_level": "Medium",
    "probability_of_default": 0.15,
    "risk_factors": ["High debt-to-income ratio", "Recent credit inquiries"],
    "recommendations": ["Reduce credit utilization", "Maintain stable employment"]
}}"""

        try:
            response = self.model.generate_content(
                prompt,
                generation_config=generative_models.GenerationConfig(
                    temperature=0.3,
                    max_output_tokens=512,
                    response_mime_type="application/json"
                )
            )
            
            data = json.loads(response.text)
            
            return RiskAssessment(
                risk_level=data.get("risk_level", "Medium"),
                probability_of_default=data.get("probability_of_default", 0.1),
                risk_factors=data.get("risk_factors", ["Insufficient data"]),
                recommendations=data.get("recommendations", ["Provide more information"])
            )
            
        except Exception as e:
            logger.error(f"Risk assessment failed: {e}")
            return RiskAssessment(
                risk_level="Medium",
                probability_of_default=0.15,
                risk_factors=["Error in assessment"],
                recommendations=["Manual review recommended"]
            )
    
    async def _check_loan_eligibility(
        self, 
        request: CreditRequest, 
        credit_score: Optional[CreditScore],
        risk_assessment: Optional[RiskAssessment]
    ) -> LoanEligibility:
        """Check loan eligibility"""
        
        score_info = f"Credit Score: {credit_score.score}" if credit_score else ""
        risk_info = f"Risk Level: {risk_assessment.risk_level}" if risk_assessment else ""
        
        prompt = f"""You are a loan eligibility expert. Based on the following information, determine loan eligibility.

Request: {request.content}
Metadata: {json.dumps(request.metadata)}
{score_info}
{risk_info}

Provide a JSON response with:
1. Eligibility status (true/false)
2. Maximum loan amount (if eligible)
3. Interest rate percentage
4. Available terms in months
5. Any special conditions

Response format:
{{
    "eligible": true,
    "max_loan_amount": 50000,
    "interest_rate": 6.5,
    "terms": [12, 24, 36, 48, 60],
    "conditions": ["Proof of income required", "Co-signer may improve terms"]
}}"""

        try:
            response = self.model.generate_content(
                prompt,
                generation_config=generative_models.GenerationConfig(
                    temperature=0.3,
                    max_output_tokens=512,
                    response_mime_type="application/json"
                )
            )
            
            data = json.loads(response.text)
            
            return LoanEligibility(
                eligible=data.get("eligible", False),
                max_loan_amount=data.get("max_loan_amount", 0),
                interest_rate=data.get("interest_rate", 10.0),
                terms=data.get("terms", [12, 24, 36]),
                conditions=data.get("conditions", [])
            )
            
        except Exception as e:
            logger.error(f"Loan eligibility check failed: {e}")
            return LoanEligibility(
                eligible=False,
                max_loan_amount=0,
                interest_rate=0,
                terms=[],
                conditions=["Error in eligibility check - manual review required"]
            )
    
    async def _generate_summary(
        self,
        credit_score: Optional[CreditScore],
        risk_assessment: Optional[RiskAssessment],
        loan_eligibility: Optional[LoanEligibility]
    ) -> str:
        """Generate comprehensive summary"""
        
        summary_parts = []
        
        if credit_score:
            summary_parts.append(f"Credit Score: {credit_score.score} ({credit_score.rating})")
        
        if risk_assessment:
            summary_parts.append(f"Risk Level: {risk_assessment.risk_level}")
            summary_parts.append(f"Default Probability: {risk_assessment.probability_of_default:.1%}")
        
        if loan_eligibility:
            if loan_eligibility.eligible:
                summary_parts.append(f"Loan Approved: Up to ${loan_eligibility.max_loan_amount:,.2f} at {loan_eligibility.interest_rate}% APR")
            else:
                summary_parts.append("Loan Not Approved")
        
        return " | ".join(summary_parts)

# Global analyzer instance
analyzer = CreditAnalyzer()

# API Routes
@app.get("/")
async def root():
    return {
        "service": "Credit Evaluation Agent",
        "version": "1.0.0",
        "status": "healthy",
        "capabilities": [
            "credit_scoring",
            "risk_assessment",
            "loan_eligibility"
        ]
    }

@app.get("/health")
async def health():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

@app.post("/process")
async def process_request(request: CreditRequest):
    """Process a credit evaluation request"""
    try:
        logger.info(f"Processing credit request: {request.id}")
        result = await analyzer.analyze(request)
        
        # Return simplified response for router compatibility
        return {
            "response": result.summary,
            "details": result.dict()
        }
        
    except Exception as e:
        logger.error(f"Processing error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/analyze")
async def analyze_credit(request: CreditRequest):
    """Detailed credit analysis endpoint"""
    try:
        result = await analyzer.analyze(request)
        return result
        
    except Exception as e:
        logger.error(f"Analysis error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8081"))
    uvicorn.run(app, host="0.0.0.0", port=port)
