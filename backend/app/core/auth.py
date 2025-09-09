from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from typing import Optional
from ..db.supabase_client import get_supabase

security = HTTPBearer(auto_error=False)


def get_current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    """Validate Supabase JWT and return user info.
    Accepts Authorization: Bearer <jwt>. Uses service key to verify via Supabase API.
    """
    if creds is None or not creds.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing auth token")

    token = creds.credentials
    sb = get_supabase()
    try:
        user = sb.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid auth token")

    if not user or not user.user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid auth token")

    # Return a minimal dict
    return {
        "id": user.user.id,
        "email": user.user.email,
        "aud": user.user.aud,
    }
