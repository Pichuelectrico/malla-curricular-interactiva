import unittest

from run_log_check import classify_run, real_failure_streak, should_alert

OK = {"filas_scrapeadas": 3546, "conteo_bd_despues": 3546, "resultado": "ok", "error": None}
EXTRA = {"filas_scrapeadas": 3546, "conteo_bd_despues": 3548, "resultado": "fallo", "error": None,
         "last_updated_counts": {"2026-11-17T18:24:36": 3546, "2026-11-17T05:18:21": 2}}


class RunLogTests(unittest.TestCase):
    def test_clean_run(self):
        self.assertEqual(classify_run(OK), "ok")

    def test_extra_rows_explained_by_older_batches_are_not_failures(self):
        self.assertEqual(classify_run(EXTRA), "ok_obsoletos_pendientes")

    def test_unexplained_extra_rows_fail(self):
        run = {**EXTRA, "last_updated_counts": {"2026-11-17T18:24:36": 3546}}
        self.assertEqual(classify_run(run), "fallo")

    def test_errors_and_missing_rows_fail(self):
        self.assertEqual(classify_run({**OK, "error": "boom"}), "fallo")
        self.assertEqual(classify_run({**OK, "conteo_bd_despues": 3000}), "fallo")
        self.assertEqual(classify_run({"filas_scrapeadas": 0, "conteo_bd_despues": 0}), "fallo")

    def test_alert_only_after_repeated_real_failures(self):
        bad = {**OK, "error": "x"}
        self.assertFalse(should_alert([OK, bad]))
        self.assertTrue(should_alert([OK, bad, bad]))
        self.assertFalse(should_alert([bad, bad, EXTRA]))  # obsoletos pendientes rompe la racha
        self.assertEqual(real_failure_streak([bad, OK, bad]), 1)


if __name__ == "__main__":
    unittest.main()
