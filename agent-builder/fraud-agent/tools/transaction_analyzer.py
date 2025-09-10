"""
Transaction Analyzer Tool for Fraud Detection Agent
Analyzes individual transactions for fraud indicators using ML and rule-based approaches
"""

import json
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
import math
from dataclasses import dataclass
from enum import Enum

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class RiskIndicator(Enum):
    """Enumeration of risk indicators"""
    HIGH_AMOUNT = "unusually_high_amount"
    VELOCITY = "high_transaction_velocity"
    GEOGRAPHIC_ANOMALY = "geographic_anomaly"
    TIME_ANOMALY = "unusual_time_pattern"
    MERCHANT_RISK = "high_risk_merchant"
    DEVICE_CHANGE = "device_fingerprint_change"
    NEW_PAYEE = "new_payee_recipient"
    ROUND_AMOUNT = "suspicious_round_amount"
    DUPLICATE = "potential_duplicate"
    CROSS_BORDER = "cross_border_transaction"


@dataclass
class TransactionAnalysis:
    """Result of transaction analysis"""
    risk_score: float
    risk_indicators: List[str]
    anomaly_details: Dict[str, any]
    velocity_score: float
    amount_score: float
    pattern_score: float
    confidence: float


class TransactionAnalyzer:
    """Main analyzer class for transaction fraud detection"""
    
    def __init__(self):
        # Risk thresholds
        self.amount_threshold_multiplier = 3.0
        self.velocity_threshold = 5  # transactions per hour
        self.geographic_speed_limit = 500  # km/hour (impossible travel speed)
        
        # High-risk merchant categories
        self.high_risk_merchants = {
            "gambling", "crypto_exchange", "wire_transfer",
            "money_service", "high_value_goods"
        }
        
        # Suspicious time patterns (UTC hours)
        self.suspicious_hours = list(range(2, 6))  # 2 AM - 6 AM
        
    def analyze_transaction(
        self,
        transaction_data: Dict,
        user_profile: Optional[Dict] = None,
        transaction_history: Optional[List[Dict]] = None
    ) -> Dict:
        """
        Main entry point for transaction analysis
        
        Args:
            transaction_data: Current transaction details
            user_profile: User's profile and typical behavior
            transaction_history: Recent transaction history
            
        Returns:
            Analysis results with risk indicators
        """
        try:
            # Initialize analysis components
            risk_indicators = []
            anomaly_details = {}
            
            # Analyze amount patterns
            amount_score, amount_indicators = self._analyze_amount(
                transaction_data, user_profile
            )
            risk_indicators.extend(amount_indicators)
            
            # Analyze velocity patterns
            velocity_score, velocity_indicators = self._analyze_velocity(
                transaction_data, transaction_history
            )
            risk_indicators.extend(velocity_indicators)
            
            # Analyze geographic patterns
            geo_score, geo_indicators = self._analyze_geographic(
                transaction_data, transaction_history
            )
            risk_indicators.extend(geo_indicators)
            
            # Analyze temporal patterns
            time_score, time_indicators = self._analyze_temporal(
                transaction_data, user_profile
            )
            risk_indicators.extend(time_indicators)
            
            # Analyze merchant risk
            merchant_score, merchant_indicators = self._analyze_merchant(
                transaction_data
            )
            risk_indicators.extend(merchant_indicators)
            
            # Calculate composite risk score
            risk_score = self._calculate_composite_score(
                amount_score, velocity_score, geo_score, 
                time_score, merchant_score
            )
            
            # Calculate confidence based on data completeness
            confidence = self._calculate_confidence(
                transaction_data, user_profile, transaction_history
            )
            
            # Build response
            analysis = TransactionAnalysis(
                risk_score=risk_score,
                risk_indicators=[ind.value for ind in risk_indicators],
                anomaly_details=anomaly_details,
                velocity_score=velocity_score,
                amount_score=amount_score,
                pattern_score=(geo_score + time_score) / 2,
                confidence=confidence
            )
            
            return self._format_response(analysis)
            
        except Exception as e:
            logger.error(f"Transaction analysis failed: {str(e)}")
            return {
                "error": str(e),
                "risk_score": 50,  # Medium risk on error
                "confidence": 0
            }
    
    def _analyze_amount(
        self, 
        transaction: Dict, 
        user_profile: Optional[Dict]
    ) -> Tuple[float, List[RiskIndicator]]:
        """Analyze transaction amount for anomalies"""
        indicators = []
        amount = transaction.get("amount", 0)
        
        # Check against user's typical amounts
        if user_profile:
            avg_amount = user_profile.get("avg_transaction_amount", 100)
            std_dev = user_profile.get("transaction_amount_std", 50)
            
            if amount > avg_amount + (self.amount_threshold_multiplier * std_dev):
                indicators.append(RiskIndicator.HIGH_AMOUNT)
                score = min(100, 50 + (amount - avg_amount) / (10 * std_dev) * 50)
            else:
                score = max(0, (amount - avg_amount) / (std_dev + 1) * 20)
        else:
            # No profile available, use absolute thresholds
            if amount > 5000:
                indicators.append(RiskIndicator.HIGH_AMOUNT)
                score = min(100, 50 + (amount - 5000) / 100)
            else:
                score = amount / 100  # Linear scaling for amounts under 5000
        
        # Check for suspicious round amounts
        if amount % 1000 == 0 and amount > 1000:
            indicators.append(RiskIndicator.ROUND_AMOUNT)
            score = min(100, score + 20)
            
        return score, indicators
    
    def _analyze_velocity(
        self,
        transaction: Dict,
        history: Optional[List[Dict]]
    ) -> Tuple[float, List[RiskIndicator]]:
        """Analyze transaction velocity patterns"""
        indicators = []
        
        if not history:
            return 0, indicators
            
        current_time = datetime.fromisoformat(
            transaction.get("timestamp", datetime.now().isoformat())
        )
        
        # Count recent transactions
        recent_count = 0
        for hist_trans in history:
            hist_time = datetime.fromisoformat(hist_trans.get("timestamp"))
            time_diff = (current_time - hist_time).total_seconds() / 3600
            
            if time_diff < 1:  # Within last hour
                recent_count += 1
                
        if recent_count >= self.velocity_threshold:
            indicators.append(RiskIndicator.VELOCITY)
            score = min(100, 50 + (recent_count - self.velocity_threshold) * 10)
        else:
            score = recent_count * 10
            
        # Check for duplicate transactions
        for hist_trans in history[-5:]:  # Check last 5 transactions
            if (hist_trans.get("amount") == transaction.get("amount") and
                hist_trans.get("merchant_id") == transaction.get("merchant_id")):
                indicators.append(RiskIndicator.DUPLICATE)
                score = min(100, score + 30)
                break
                
        return score, indicators
    
    def _analyze_geographic(
        self,
        transaction: Dict,
        history: Optional[List[Dict]]
    ) -> Tuple[float, List[RiskIndicator]]:
        """Analyze geographic patterns and impossible travel"""
        indicators = []
        score = 0
        
        location = transaction.get("location")
        if not location or not history:
            return score, indicators
            
        # Check for cross-border transaction
        if location.get("country") != "US":
            indicators.append(RiskIndicator.CROSS_BORDER)
            score += 30
            
        # Check for impossible travel
        current_time = datetime.fromisoformat(
            transaction.get("timestamp", datetime.now().isoformat())
        )
        
        for hist_trans in history[-3:]:  # Check last 3 transactions
            hist_location = hist_trans.get("location")
            if not hist_location:
                continue
                
            hist_time = datetime.fromisoformat(hist_trans.get("timestamp"))
            time_diff_hours = (current_time - hist_time).total_seconds() / 3600
            
            if time_diff_hours > 0:
                distance = self._calculate_distance(location, hist_location)
                speed = distance / time_diff_hours
                
                if speed > self.geographic_speed_limit:
                    indicators.append(RiskIndicator.GEOGRAPHIC_ANOMALY)
                    score = min(100, score + 50)
                    break
                    
        return score, indicators
    
    def _analyze_temporal(
        self,
        transaction: Dict,
        user_profile: Optional[Dict]
    ) -> Tuple[float, List[RiskIndicator]]:
        """Analyze temporal patterns"""
        indicators = []
        
        timestamp = datetime.fromisoformat(
            transaction.get("timestamp", datetime.now().isoformat())
        )
        hour = timestamp.hour
        
        # Check for unusual hours
        if hour in self.suspicious_hours:
            indicators.append(RiskIndicator.TIME_ANOMALY)
            score = 30
        else:
            score = 0
            
        # Check against user's typical pattern
        if user_profile:
            typical_hours = user_profile.get("typical_transaction_hours", [])
            if typical_hours and hour not in typical_hours:
                score = min(100, score + 20)
                
        return score, indicators
    
    def _analyze_merchant(
        self,
        transaction: Dict
    ) -> Tuple[float, List[RiskIndicator]]:
        """Analyze merchant risk factors"""
        indicators = []
        
        merchant_category = transaction.get("merchant_category", "").lower()
        
        if merchant_category in self.high_risk_merchants:
            indicators.append(RiskIndicator.MERCHANT_RISK)
            score = 40
        else:
            score = 0
            
        # Check for new payee
        if transaction.get("is_new_payee", False):
            indicators.append(RiskIndicator.NEW_PAYEE)
            score = min(100, score + 30)
            
        return score, indicators
    
    def _calculate_distance(self, loc1: Dict, loc2: Dict) -> float:
        """Calculate distance between two locations in km"""
        lat1, lon1 = loc1.get("lat", 0), loc1.get("lng", 0)
        lat2, lon2 = loc2.get("lat", 0), loc2.get("lng", 0)
        
        # Haversine formula
        R = 6371  # Earth's radius in km
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)
        a = (math.sin(dlat/2) ** 2 + 
             math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * 
             math.sin(dlon/2) ** 2)
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
        
        return R * c
    
    def _calculate_composite_score(self, *scores) -> float:
        """Calculate weighted composite risk score"""
        weights = [0.3, 0.25, 0.2, 0.15, 0.1]  # Weights for each score type
        weighted_sum = sum(s * w for s, w in zip(scores, weights))
        return min(100, max(0, weighted_sum))
    
    def _calculate_confidence(
        self,
        transaction: Dict,
        user_profile: Optional[Dict],
        history: Optional[List[Dict]]
    ) -> float:
        """Calculate confidence based on data completeness"""
        data_points = 0
        total_points = 0
        
        # Check transaction data completeness
        important_fields = ["amount", "merchant_id", "timestamp", "location"]
        for field in important_fields:
            total_points += 1
            if transaction.get(field):
                data_points += 1
                
        # Check profile availability
        total_points += 1
        if user_profile:
            data_points += 1
            
        # Check history availability
        total_points += 1
        if history and len(history) > 5:
            data_points += 1
            
        return (data_points / total_points) * 100
    
    def _format_response(self, analysis: TransactionAnalysis) -> Dict:
        """Format analysis results for response"""
        return {
            "risk_score": round(analysis.risk_score, 2),
            "risk_indicators": analysis.risk_indicators,
            "scores": {
                "velocity": round(analysis.velocity_score, 2),
                "amount": round(analysis.amount_score, 2),
                "pattern": round(analysis.pattern_score, 2)
            },
            "confidence": round(analysis.confidence, 2),
            "anomaly_details": analysis.anomaly_details,
            "timestamp": datetime.now().isoformat()
        }


# Cloud Function entry point
def analyze_transaction(request):
    """
    Cloud Function entry point for transaction analysis
    
    Args:
        request: Flask request object with JSON payload
        
    Returns:
        JSON response with analysis results
    """
    try:
        # Parse request
        request_json = request.get_json()
        transaction_data = request_json.get("transaction")
        user_profile = request_json.get("user_profile")
        transaction_history = request_json.get("history", [])
        
        # Initialize analyzer
        analyzer = TransactionAnalyzer()
        
        # Perform analysis
        result = analyzer.analyze_transaction(
            transaction_data,
            user_profile,
            transaction_history
        )
        
        return json.dumps(result), 200, {"Content-Type": "application/json"}
        
    except Exception as e:
        logger.error(f"Function error: {str(e)}")
        return json.dumps({
            "error": str(e),
            "risk_score": 50,
            "confidence": 0
        }), 500, {"Content-Type": "application/json"}
