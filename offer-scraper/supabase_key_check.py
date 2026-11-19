"""Check that the scraper writes to Supabase with a REAL service_role key (not the public anon key).

The anon key ships in the frontend bundle; while the scraper uses it, the offer tables must stay
writable by `anon` (see supabase/migrations/20261119000001_revoke_anon_offer_writes.sql).

Behaviour of `ensure_service_role()`:
  * service_role key            -> OK, silent.
  * anon / unknown key          -> warning by default (cron keeps working today);
                                   hard failure when SCRAPER_REQUIRE_SERVICE_ROLE=1.

Run `python supabase_key_check.py` to print the detected role (never prints the key).
"""

from __future__ import annotations

import base64
import json
import logging
import os
import sys

log = logging.getLogger(__name__)

STRICT_ENV = "SCRAPER_REQUIRE_SERVICE_ROLE"


def key_role(key: str) -> str:
    """Return 'service_role', 'anon' or 'unknown' without calling the network."""
    key = (key or "").strip()
    if key.startswith("sb_secret_"):
        return "service_role"
    if key.startswith("sb_publishable_"):
        return "anon"
    parts = key.split(".")
    if len(parts) != 3:
        return "unknown"
    try:
        payload = parts[1] + "=" * (-len(parts[1]) % 4)
        role = json.loads(base64.urlsafe_b64decode(payload)).get("role")
    except Exception:  # noqa: BLE001 - malformed token
        return "unknown"
    return role if role in ("service_role", "anon") else "unknown"


def effective_key() -> str:
    """Same precedence the scraper uses: SUPABASE_KEY first, then SUPABASE_SERVICE_KEY."""
    return os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_SERVICE_KEY", "")


def ensure_service_role(key: str | None = None) -> str:
    role = key_role(effective_key() if key is None else key)
    if role == "service_role":
        return role
    strict = os.environ.get(STRICT_ENV, "").strip().lower() in ("1", "true", "yes")
    msg = (
        f"La clave de Supabase del scraper es '{role}', no una service_role real. "
        "Con una clave anon el rol público necesita permisos de escritura sobre course_offer*/offer_metadata "
        "(riesgo de seguridad). Pega la service_role en offer-scraper/.env (SUPABASE_SERVICE_KEY; "
        "quita SUPABASE_KEY si existe) y luego aplica supabase/migrations/20261119000001_revoke_anon_offer_writes.sql."
    )
    if strict:
        log.error("%s (%s=1: abortando)", msg, STRICT_ENV)
        sys.exit(1)
    log.warning("%s", msg)
    return role


if __name__ == "__main__":
    try:
        from dotenv import load_dotenv

        load_dotenv()
    except ImportError:  # pragma: no cover
        pass
    print(f"effective key role: {key_role(effective_key())}")
