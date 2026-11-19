import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import coverage as cov  # noqa: E402
from data import export  # noqa: E402


def row(code, total, available, ts="2026-11-19T10:00:00+00:00", type_="Teoría"):
    return {"course_code": code, "total": total, "available": available, "last_updated": ts, "type": type_}


class ObsoleteOfferTests(unittest.TestCase):
    def test_drops_rows_from_older_batches(self):
        offer = [row("CMP-1", 20, None)] * 19 + [row("CMP-2", 20, None, ts="2026-11-17T10:00:00+00:00")]
        fresh, obsolete = cov.split_obsolete_offer(offer)
        self.assertEqual((len(fresh), len(obsolete)), (19, 1))

    def test_guard_keeps_everything_when_latest_batch_is_small(self):
        offer = [row("CMP-1", 20, None)] * 5 + [row("CMP-2", 20, None, ts="2026-11-17T10:00:00+00:00")] * 5
        fresh, obsolete = cov.split_obsolete_offer(offer)
        self.assertEqual((len(fresh), len(obsolete)), (10, 0))

    def test_no_timestamps_keeps_everything(self):
        fresh, obsolete = cov.split_obsolete_offer([{"course_code": "X", "total": 1}])
        self.assertEqual((len(fresh), len(obsolete)), (1, 0))


class PlannedPeriodTests(unittest.TestCase):
    def test_scopes(self):
        self.assertEqual(cov.planned_applies({"planned_period_code": "202620"}), "target")
        self.assertEqual(cov.planned_applies({"planned_period_code": None}), "legacy")
        self.assertEqual(cov.planned_applies({}), "legacy")
        self.assertEqual(cov.planned_applies({"planned_period_code": "202610"}), "other")

    def test_ghost_rows(self):
        self.assertTrue(cov.is_real_progress_row({"curriculum_id": "Malla-academica-CMP"}))
        self.assertFalse(cov.is_real_progress_row({"curriculum_id": "cmp-usfq"}))


class LiveEnrollmentTests(unittest.TestCase):
    def test_enrollment_progress_requires_available(self):
        offer = [row("CMP-1", 20, 5), row("CMP-1", 20, None), row("CMP-2", 10, 10)]
        out = cov.enrollment_progress_by_code(offer)
        self.assertEqual(out["CMP-1"]["matriculados"], 15)
        self.assertTrue(out["CMP-1"]["informativo"])  # 1 de 2 secciones medidas (50 %)
        self.assertEqual(out["CMP-2"]["matriculados"], 0)

    def test_sparse_measurement_is_not_informative(self):
        offer = [row("CMP-1", 20, 5)] + [row("CMP-1", 20, None)] * 4
        self.assertFalse(cov.enrollment_progress_by_code(offer)["CMP-1"]["informativo"])


class ExportFetchTests(unittest.TestCase):
    def test_raises_when_count_mismatch_persists(self):
        with mock.patch.object(export, "SUPABASE_URL", "http://x"), mock.patch.object(export, "SUPABASE_KEY", "k"), \
                mock.patch.object(export, "_expected_count", return_value=5), \
                mock.patch.object(export, "_fetch_pages", return_value=[{"id": 1}, {"id": 2}]):
            with self.assertRaises(RuntimeError):
                export.fetch_table("user_progress")

    def test_raises_on_duplicate_order_values(self):
        with mock.patch.object(export, "SUPABASE_URL", "http://x"), mock.patch.object(export, "SUPABASE_KEY", "k"), \
                mock.patch.object(export, "_expected_count", return_value=2), \
                mock.patch.object(export, "_fetch_pages", return_value=[{"id": 1}, {"id": 1}]):
            with self.assertRaises(RuntimeError):
                export.fetch_table("user_progress")

    def test_ok_when_consistent(self):
        with mock.patch.object(export, "SUPABASE_URL", "http://x"), mock.patch.object(export, "SUPABASE_KEY", "k"), \
                mock.patch.object(export, "_expected_count", return_value=2), \
                mock.patch.object(export, "_fetch_pages", return_value=[{"id": 1}, {"id": 2}]):
            self.assertEqual(len(export.fetch_table("user_progress")), 2)


if __name__ == "__main__":
    unittest.main()
