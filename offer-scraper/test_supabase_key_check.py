import base64
import json
import os
import unittest
from unittest import mock

from supabase_key_check import ensure_service_role, key_role


def jwt(role: str) -> str:
    enc = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")  # noqa: E731
    return f"{enc({'alg': 'HS256'})}.{enc({'role': role})}.sig"


class KeyRoleTests(unittest.TestCase):
    def test_detects_roles(self):
        self.assertEqual(key_role(jwt("service_role")), "service_role")
        self.assertEqual(key_role(jwt("anon")), "anon")
        self.assertEqual(key_role("sb_secret_abc"), "service_role")
        self.assertEqual(key_role("sb_publishable_abc"), "anon")
        self.assertEqual(key_role("garbage"), "unknown")
        self.assertEqual(key_role(""), "unknown")

    def test_warns_by_default_for_anon(self):
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("SCRAPER_REQUIRE_SERVICE_ROLE", None)
            self.assertEqual(ensure_service_role(jwt("anon")), "anon")

    def test_strict_mode_exits_for_anon(self):
        with mock.patch.dict(os.environ, {"SCRAPER_REQUIRE_SERVICE_ROLE": "1"}):
            with self.assertRaises(SystemExit):
                ensure_service_role(jwt("anon"))

    def test_service_role_passes_in_strict_mode(self):
        with mock.patch.dict(os.environ, {"SCRAPER_REQUIRE_SERVICE_ROLE": "1"}):
            self.assertEqual(ensure_service_role(jwt("service_role")), "service_role")


if __name__ == "__main__":
    unittest.main()
