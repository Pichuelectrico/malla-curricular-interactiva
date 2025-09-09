from functools import lru_cache
from pydantic import BaseModel
import os
from dotenv import load_dotenv

# Load .env at import time for local dev
load_dotenv()

class Settings(BaseModel):
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_ANON_KEY: str = os.getenv("SUPABASE_ANON_KEY", "")
    SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

    APP_ENV: str = os.getenv("APP_ENV", "dev")
    APP_HOST: str = os.getenv("APP_HOST", "0.0.0.0")
    APP_PORT: int = int(os.getenv("APP_PORT", "8000"))

    FRONTEND_ORIGINS: str = os.getenv("FRONTEND_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    ADMIN_EMAILS_RAW: str = os.getenv("ADMIN_EMAILS", "")

    @property
    def ADMIN_EMAILS(self) -> list[str]:
        return [e.strip().lower() for e in (self.ADMIN_EMAILS_RAW or "").split(",") if e.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
