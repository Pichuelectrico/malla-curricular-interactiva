from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Dict, Any, Set
from ..db.supabase_client import get_supabase
from ..core.auth import get_current_user
from ..models.schemas import ValidateRequest, SuggestRequest

router = APIRouter()


PASSED_STATUSES = {"passed", "aprobada", "approved"}


def _get_student(sb, user: Dict[str, Any]):
    # Try to find student by auth_user_id -> fallback by email
    auth_id = user.get("id")
    email = user.get("email")
    sres = sb.table("students").select("id, name, email, career_id").eq("auth_user_id", auth_id).execute()
    if sres.data:
        return sres.data[0]
    if email:
        sres = sb.table("students").select("id, name, email, career_id").eq("email", email).execute()
        if sres.data:
            return sres.data[0]
    raise HTTPException(status_code=404, detail="Student profile not found; please create it in 'students' table")


def _completed_courses(sb, student_id: str) -> Set[str]:
    res = sb.table("student_courses").select("course_id, status").eq("student_id", student_id).execute()
    completed = set()
    for row in res.data or []:
        if (row.get("status") or "").lower() in PASSED_STATUSES:
            completed.add(row["course_id"])
    return completed


def _all_curriculum_courses(sb, career_id: str) -> Dict[str, Dict[str, Any]]:
    # Fetch courses that belong to a career via curricula
    cur = sb.table("curricula").select("course_id").eq("career_id", career_id).execute()
    course_ids = [c["course_id"] for c in (cur.data or [])]
    if not course_ids:
        return {}
    # Fetch details
    # Supabase supports 'in' filter via .in_(col, list)
    crs = sb.table("courses").select("id, code, title, credits, semester, block, area, type").in_("id", course_ids).execute()
    return {c["id"]: c for c in (crs.data or [])}


def _prereq_map(sb, course_ids: List[str]) -> Dict[str, List[str]]:
    if not course_ids:
        return {}
    rows = sb.table("prerequisites").select("course_id, prerequisite_id").in_("course_id", course_ids).execute()
    m: Dict[str, List[str]] = {}
    for r in rows.data or []:
        m.setdefault(r["course_id"], []).append(r["prerequisite_id"])
    return m


@router.get("/me")
async def me(user=Depends(get_current_user)):
    sb = get_supabase()
    student = _get_student(sb, user)
    return {"auth": user, "student": student}


@router.post("/me/init")
async def init_me(name: str | None = None, career_id: str | None = None, user=Depends(get_current_user)):
    """Create or update the current student's profile in `students` table.
    Fields: auth_user_id (from Supabase), email, optional name, optional career_id.
    """
    sb = get_supabase()
    auth_id = user.get("id")
    email = user.get("email")
    if not auth_id or not email:
        raise HTTPException(status_code=400, detail="Invalid auth user")

    payload: Dict[str, Any] = {
        "auth_user_id": auth_id,
        "email": email,
    }
    if name is not None:
        payload["name"] = name
    if career_id is not None:
        payload["career_id"] = career_id

    try:
        res = sb.table("students").upsert(payload, on_conflict="auth_user_id").select("id, name, email, career_id").execute()
        return {"student": res.data[0] if res.data else None}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to init student profile: {e}")


@router.get("/{student_id}/available")
async def available_courses(student_id: str, career_id: str = Query(...)):
    """List courses a student can take given completed prerequisites."""
    sb = get_supabase()
    completed = _completed_courses(sb, student_id)
    courses = _all_curriculum_courses(sb, career_id)
    prereqs = _prereq_map(sb, list(courses.keys()))

    available = []
    for cid, c in courses.items():
        pres = set(prereqs.get(cid, []))
        if pres.issubset(completed) and cid not in completed:
            available.append(c)
    # Sort by semester, then code
    available.sort(key=lambda c: (c.get("semester") or 99, c.get("code") or ""))
    return {"count": len(available), "items": available}


@router.post("/{student_id}/validate")
async def validate_prerequisites(student_id: str, payload: ValidateRequest):
    sb = get_supabase()
    completed = _completed_courses(sb, student_id)
    rows = sb.table("prerequisites").select("prerequisite_id").eq("course_id", payload.course_id).execute()
    required = [r["prerequisite_id"] for r in (rows.data or [])]
    missing = [p for p in required if p not in completed]
    return {"course_id": payload.course_id, "ok": len(missing) == 0, "missing": missing}


@router.post("/{student_id}/suggest")
async def suggest_next_semester(student_id: str, career_id: str = Query(...), payload: SuggestRequest = None):
    """Suggest a semester plan up to max_credits.
    Heuristic: Prefer lower semester courses first, include only available ones (all prerequisites met), stop at max_credits.
    """
    sb = get_supabase()
    max_credits = 16
    if payload and payload.max_credits:
        max_credits = payload.max_credits

    completed = _completed_courses(sb, student_id)
    courses = _all_curriculum_courses(sb, career_id)
    prereqs = _prereq_map(sb, list(courses.keys()))

    candidates = []
    for cid, c in courses.items():
        if cid in completed:
            continue
        pres = set(prereqs.get(cid, []))
        if pres.issubset(completed):
            candidates.append(c)

    # Sort by planned semester asc, then by code
    candidates.sort(key=lambda c: (c.get("semester") or 99, c.get("code") or ""))

    selected: List[Dict[str, Any]] = []
    total = 0
    for c in candidates:
        cr = int(c.get("credits") or 0)
        if total + cr <= max_credits:
            selected.append(c)
            total += cr
        if total >= max_credits:
            break

    return {"max_credits": max_credits, "total_credits": total, "items": selected}
