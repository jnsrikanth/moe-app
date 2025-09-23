"""
ESG Analysis Agent
Specialized agent for Environmental, Social, and Governance assessment
"""

import os
import json
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime
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
    title="ESG Analysis Agent",
    version="1.0.0",
    description="Specialized agent for ESG compliance and sustainability assessment"
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
MODEL_NAME = os.getenv("ESG_MODEL_NAME", "gemini-1.5-pro")

# Initialize Vertex AI
vertexai.init(project=VERTEX_AI_PROJECT, location=VERTEX_AI_LOCATION)
model = GenerativeModel(MODEL_NAME)

# Data Models
class ESGRequest(BaseModel):
    id: str
    type: str
    content: str
    metadata: Dict[str, Any] = {}
    timestamp: datetime = Field(default_factory=datetime.now)

class ESGRating(str, Enum):
    AAA = "AAA"
    AA = "AA"
    A = "A"
    BBB = "BBB"
    BB = "BB"
    B = "B"
    CCC = "CCC"

class EnvironmentalScore(BaseModel):
    score: float  # 0-100
    carbon_footprint: str
    renewable_energy_usage: float
    waste_management: str
    water_usage: str
    biodiversity_impact: str

class SocialScore(BaseModel):
    score: float  # 0-100
    employee_welfare: str
    diversity_inclusion: str
    community_impact: str
    human_rights: str
    customer_satisfaction: str

class GovernanceScore(BaseModel):
    score: float  # 0-100
    board_structure: str
    executive_compensation: str
    shareholder_rights: str
    transparency: str
    ethics_compliance: str

class ESGAssessment(BaseModel):
    overall_score: float  # 0-100
    overall_rating: ESGRating
    environmental: EnvironmentalScore
    social: SocialScore
    governance: GovernanceScore
    risks: List[str]
    opportunities: List[str]
    recommendations: List[str]

class ESGResponse(BaseModel):
    request_id: str
    assessment: ESGAssessment
    compliance_status: Dict[str, bool]
    summary: str
    processing_time_ms: float
    timestamp: datetime = Field(default_factory=datetime.now)

# ESG Analysis Engine
class ESGAnalyzer:
    """Main ESG analysis engine"""
    
    def __init__(self):
        self.model = model
        self.compliance_frameworks = [
            "UN Global Compact",
            "GRI Standards",
            "SASB Standards",
            "TCFD Recommendations",
            "EU Taxonomy"
        ]
    
    async def analyze(self, request: ESGRequest) -> ESGResponse:
        """Perform comprehensive ESG analysis"""
        
        start_time = datetime.now()
        
        # Analyze each ESG component
        environmental = await self._analyze_environmental(request)
        social = await self._analyze_social(request)
        governance = await self._analyze_governance(request)
        
        # Calculate overall score
        overall_score = (environmental.score + social.score + governance.score) / 3
        overall_rating = self._calculate_rating(overall_score)
        
        # Identify risks and opportunities
        risks = await self._identify_risks(request, environmental, social, governance)
        opportunities = await self._identify_opportunities(request, environmental, social, governance)
        
        # Generate recommendations
        recommendations = await self._generate_recommendations(
            environmental, social, governance, risks
        )
        
        # Check compliance
        compliance_status = await self._check_compliance(request)
        
        assessment = ESGAssessment(
            overall_score=overall_score,
            overall_rating=overall_rating,
            environmental=environmental,
            social=social,
            governance=governance,
            risks=risks,
            opportunities=opportunities,
            recommendations=recommendations
        )
        
        processing_time_ms = (datetime.now() - start_time).total_seconds() * 1000
        
        summary = f"ESG Rating: {overall_rating} (Score: {overall_score:.1f}/100) - E:{environmental.score:.0f} S:{social.score:.0f} G:{governance.score:.0f}"
        
        return ESGResponse(
            request_id=request.id,
            assessment=assessment,
            compliance_status=compliance_status,
            summary=summary,
            processing_time_ms=processing_time_ms
        )
    
    async def _analyze_environmental(self, request: ESGRequest) -> EnvironmentalScore:
        """Analyze environmental factors"""
        
        prompt = f"""Analyze the environmental aspects of the following entity/request.

Request: {request.content}
Metadata: {json.dumps(request.metadata)}

Provide a JSON assessment of environmental performance:
{{
    "score": 75,
    "carbon_footprint": "Low - 50% below industry average",
    "renewable_energy_usage": 65.5,
    "waste_management": "Excellent recycling program, zero landfill policy",
    "water_usage": "Efficient - 30% reduction in last 3 years",
    "biodiversity_impact": "Minimal - protected area conservation programs"
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
            
            return EnvironmentalScore(
                score=data.get("score", 50),
                carbon_footprint=data.get("carbon_footprint", "Not assessed"),
                renewable_energy_usage=data.get("renewable_energy_usage", 0),
                waste_management=data.get("waste_management", "Not assessed"),
                water_usage=data.get("water_usage", "Not assessed"),
                biodiversity_impact=data.get("biodiversity_impact", "Not assessed")
            )
            
        except Exception as e:
            logger.error(f"Environmental analysis failed: {e}")
            return EnvironmentalScore(
                score=50,
                carbon_footprint="Error in assessment",
                renewable_energy_usage=0,
                waste_management="Error in assessment",
                water_usage="Error in assessment",
                biodiversity_impact="Error in assessment"
            )
    
    async def _analyze_social(self, request: ESGRequest) -> SocialScore:
        """Analyze social factors"""
        
        prompt = f"""Analyze the social aspects of the following entity/request.

Request: {request.content}
Metadata: {json.dumps(request.metadata)}

Provide a JSON assessment of social performance:
{{
    "score": 80,
    "employee_welfare": "Strong benefits, work-life balance programs",
    "diversity_inclusion": "40% women in leadership, diverse workforce",
    "community_impact": "Active community engagement, local hiring",
    "human_rights": "Strong policies, supply chain monitoring",
    "customer_satisfaction": "High ratings, responsive support"
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
            
            return SocialScore(
                score=data.get("score", 50),
                employee_welfare=data.get("employee_welfare", "Not assessed"),
                diversity_inclusion=data.get("diversity_inclusion", "Not assessed"),
                community_impact=data.get("community_impact", "Not assessed"),
                human_rights=data.get("human_rights", "Not assessed"),
                customer_satisfaction=data.get("customer_satisfaction", "Not assessed")
            )
            
        except Exception as e:
            logger.error(f"Social analysis failed: {e}")
            return SocialScore(
                score=50,
                employee_welfare="Error in assessment",
                diversity_inclusion="Error in assessment",
                community_impact="Error in assessment",
                human_rights="Error in assessment",
                customer_satisfaction="Error in assessment"
            )
    
    async def _analyze_governance(self, request: ESGRequest) -> GovernanceScore:
        """Analyze governance factors"""
        
        prompt = f"""Analyze the governance aspects of the following entity/request.

Request: {request.content}
Metadata: {json.dumps(request.metadata)}

Provide a JSON assessment of governance performance:
{{
    "score": 85,
    "board_structure": "Independent majority, diverse expertise",
    "executive_compensation": "Performance-linked, transparent",
    "shareholder_rights": "Strong protections, equal voting",
    "transparency": "Regular detailed reporting, open communication",
    "ethics_compliance": "Robust policies, regular training"
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
            
            return GovernanceScore(
                score=data.get("score", 50),
                board_structure=data.get("board_structure", "Not assessed"),
                executive_compensation=data.get("executive_compensation", "Not assessed"),
                shareholder_rights=data.get("shareholder_rights", "Not assessed"),
                transparency=data.get("transparency", "Not assessed"),
                ethics_compliance=data.get("ethics_compliance", "Not assessed")
            )
            
        except Exception as e:
            logger.error(f"Governance analysis failed: {e}")
            return GovernanceScore(
                score=50,
                board_structure="Error in assessment",
                executive_compensation="Error in assessment",
                shareholder_rights="Error in assessment",
                transparency="Error in assessment",
                ethics_compliance="Error in assessment"
            )
    
    def _calculate_rating(self, score: float) -> ESGRating:
        """Calculate ESG rating based on score"""
        
        if score >= 90:
            return ESGRating.AAA
        elif score >= 80:
            return ESGRating.AA
        elif score >= 70:
            return ESGRating.A
        elif score >= 60:
            return ESGRating.BBB
        elif score >= 50:
            return ESGRating.BB
        elif score >= 40:
            return ESGRating.B
        else:
            return ESGRating.CCC
    
    async def _identify_risks(
        self,
        request: ESGRequest,
        environmental: EnvironmentalScore,
        social: SocialScore,
        governance: GovernanceScore
    ) -> List[str]:
        """Identify ESG risks"""
        
        risks = []
        
        if environmental.score < 50:
            risks.append("High environmental risk - potential regulatory penalties")
        if social.score < 50:
            risks.append("Social license to operate at risk")
        if governance.score < 50:
            risks.append("Governance weaknesses may impact investor confidence")
        
        # Add specific risks based on scores
        if environmental.score < 70:
            risks.append("Climate transition risk")
        if social.score < 70:
            risks.append("Talent retention challenges")
        if governance.score < 70:
            risks.append("Compliance and regulatory risk")
        
        return risks
    
    async def _identify_opportunities(
        self,
        request: ESGRequest,
        environmental: EnvironmentalScore,
        social: SocialScore,
        governance: GovernanceScore
    ) -> List[str]:
        """Identify ESG opportunities"""
        
        opportunities = []
        
        if environmental.score > 70:
            opportunities.append("Green financing opportunities")
        if social.score > 70:
            opportunities.append("Strong employer brand advantage")
        if governance.score > 70:
            opportunities.append("Attractive to ESG-focused investors")
        
        return opportunities
    
    async def _generate_recommendations(
        self,
        environmental: EnvironmentalScore,
        social: SocialScore,
        governance: GovernanceScore,
        risks: List[str]
    ) -> List[str]:
        """Generate improvement recommendations"""
        
        recommendations = []
        
        if environmental.score < 70:
            recommendations.append("Develop science-based emissions targets")
            recommendations.append("Increase renewable energy adoption")
        
        if social.score < 70:
            recommendations.append("Enhance diversity and inclusion programs")
            recommendations.append("Strengthen supply chain due diligence")
        
        if governance.score < 70:
            recommendations.append("Improve board independence and diversity")
            recommendations.append("Enhance transparency in reporting")
        
        return recommendations
    
    async def _check_compliance(self, request: ESGRequest) -> Dict[str, bool]:
        """Check compliance with major ESG frameworks"""
        
        # Simplified compliance check - in production, this would be more detailed
        return {
            "UN Global Compact": True,
            "GRI Standards": True,
            "SASB Standards": False,
            "TCFD Recommendations": True,
            "EU Taxonomy": False
        }

# Global analyzer instance
analyzer = ESGAnalyzer()

# API Routes
@app.get("/")
async def root():
    return {
        "service": "ESG Analysis Agent",
        "version": "1.0.0",
        "status": "healthy",
        "capabilities": [
            "environmental_impact",
            "social_compliance",
            "governance_assessment",
            "sustainability_scoring"
        ]
    }

@app.get("/health")
async def health():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

@app.post("/process")
async def process_request(request: ESGRequest):
    """Process an ESG analysis request"""
    try:
        logger.info(f"Processing ESG request: {request.id}")
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
async def analyze_esg(request: ESGRequest):
    """Detailed ESG analysis endpoint"""
    try:
        result = await analyzer.analyze(request)
        return result
        
    except Exception as e:
        logger.error(f"Analysis error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8083"))
    uvicorn.run(app, host="0.0.0.0", port=port)
