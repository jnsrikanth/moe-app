from functools import lru_cache
import os
from pydantic import BaseModel


class Settings(BaseModel):
    # Service ports
    CREDIT_PORT: int = int(os.getenv("CREDIT_PORT", "8081"))
    FRAUD_PORT: int = int(os.getenv("FRAUD_PORT", "8082"))
    ESG_PORT: int = int(os.getenv("ESG_PORT", "8083"))
    ROUTER_PORT: int = int(os.getenv("ROUTER_PORT", "8080"))

    # Router strategy
    ROUTER_STRATEGY: str = os.getenv("ROUTER_STRATEGY", "llm")

    # Agent endpoints (compose service names by default)
    CREDIT_AGENT_URL: str = os.getenv("CREDIT_AGENT_URL", f"http://credit:{CREDIT_PORT}")
    FRAUD_AGENT_URL: str = os.getenv("FRAUD_AGENT_URL", f"http://fraud:{FRAUD_PORT}")
    ESG_AGENT_URL: str = os.getenv("ESG_AGENT_URL", f"http://esg:{ESG_PORT}")


@lru_cache
def get_settings() -> Settings:
    return Settings()