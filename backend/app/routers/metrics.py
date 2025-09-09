from fastapi import APIRouter, Query
from typing import Dict, Any, List
from ..db.supabase_client import get_supabase

router = APIRouter()


@router.get("/enrollment-estimate")
async def enrollment_estimate(course_ids: List[str] = Query(default=[])):
    """Mock: Estimate how many will take a course next semester.
    Heuristic mock:
    - Base = historical count of enrollments with status in {passed, enrolled}
    - If no history, use random-ish baseline from course code hash
    """
    sb = get_supabase()
    estimates: Dict[str, Any] = {}

    for cid in course_ids:
        res = sb.rpc(
            "enrollment_estimate_by_course",
            {"p_course_id": cid}
        ).execute()
        if res.data and isinstance(res.data, list) and len(res.data) > 0 and "estimate" in res.data[0]:
            estimates[cid] = int(res.data[0]["estimate"])  # from SQL function if present
        else:
            # Fallback mock
            baseline = (abs(hash(cid)) % 40) + 5
            estimates[cid] = baseline

    return {"items": estimates}


@router.get("/path-adherence")
async def path_adherence(career_id: str = Query(...)):
    """Mock: Percentage of students following official plan (by planned semester order)."""
    # In real impl, compare student's taken semester vs course.semester distribution
    # Here: mock by career_id hash
    h = abs(hash(career_id)) % 100
    return {"career_id": career_id, "official_path_percent": 60 + (h % 20) / 2}


@router.get("/trend-suggestions")
async def trend_suggestions(career_id: str = Query(...)):
    """Mock: Suggest popular next courses from historical trends."""
    # Mock suggestions
    sb = get_supabase()
    cur = sb.table("curricula").select("course_id").eq("career_id", career_id).limit(10).execute()
    ids = [r["course_id"] for r in (cur.data or [])]
    if not ids:
        return {"items": []}
    crs = sb.table("courses").select("id, code, title, credits, semester").in_("id", ids).execute()
    items = sorted((crs.data or []), key=lambda c: (c.get("semester") or 99, c.get("code") or ""))[:5]
    return {"items": items}
