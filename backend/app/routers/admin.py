from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, Any, List
from ..db.supabase_client import get_supabase
from ..core.auth import get_current_user
from ..core.config import settings

router = APIRouter()


def _require_admin(user: Dict[str, Any]):
    email = (user or {}).get("email", "").lower()
    if email not in settings.ADMIN_EMAILS:
        raise HTTPException(status_code=403, detail="Admin privileges required")


def _sum_credits(courses: List[Dict[str, Any]]):
    return sum(int(c.get("credits") or 0) for c in courses)


def _fetch_all_students(sb):
    res = sb.table("students").select("id, email, current_semester").execute()
    return res.data or []


def _planned_or_enrolled_for_student(sb, student_id: str):
    rows = sb.table("student_courses").select("course_id, status").eq("student_id", student_id).in_("status", ["planned", "enrolled"]).execute()
    return rows.data or []


def _course_details(sb, course_ids: List[str]):
    if not course_ids:
        return {}
    crs = sb.table("courses").select("id, code, title, credits, semester").in_("id", course_ids).execute()
    return {c["id"]: c for c in (crs.data or [])}


@router.get("/semester")
async def get_global_semester(user=Depends(get_current_user)):
    """Admin: get current global semester value."""
    _require_admin(user)
    sb = get_supabase()
    cur = sb.table("semester_control").select("current_semester").eq("slug", "U").limit(1).execute()
    if not cur.data:
        raise HTTPException(status_code=500, detail="semester_control not initialized")
    return {"current_semester": int(cur.data[0].get("current_semester") or 0)}


@router.get("/students")
async def list_students(user=Depends(get_current_user)):
    """Admin: list basic student info."""
    _require_admin(user)
    sb = get_supabase()
    res = sb.table("students").select("id, email, name, current_semester").order("email").execute()
    return res.data or []


@router.post("/semester/advance")
async def advance_global_semester(user=Depends(get_current_user)):
    """Admin: increment global semester (slug 'U'), increment every student's current_semester by 1,
    and mark up to 16 credits of their planned/enrolled courses as passed (prioritizing lower semester).
    """
    _require_admin(user)
    sb = get_supabase()

    # 1) Read current global and bump by 1
    cur = sb.table("semester_control").select("id, current_semester").eq("slug", "U").limit(1).execute()
    if not cur.data:
        raise HTTPException(status_code=500, detail="semester_control not initialized")
    sc = cur.data[0]
    new_sem = int(sc["current_semester"]) + 1
    sb.table("semester_control").update({"current_semester": new_sem}).eq("id", sc["id"]).execute()

    # 2) Fetch all students
    students = _fetch_all_students(sb)

    for s in students:
        sid = s["id"]
        # bump student's semester
        sb.table("students").update({"current_semester": int(s.get("current_semester") or 0) + 1}).eq("id", sid).execute()

        # promote planned/enrolled up to 16 credits
        planned = _planned_or_enrolled_for_student(sb, sid)
        cids = [r["course_id"] for r in planned]
        cmap = _course_details(sb, cids)
        # choose order: by courses.semester then code
        ordered = sorted([cmap[cid] for cid in cids if cid in cmap], key=lambda c: (c.get("semester") or 99, c.get("code") or ""))
        selected: List[Dict[str, Any]] = []
        total = 0
        for c in ordered:
            cr = int(c.get("credits") or 0)
            if total + cr <= 16:
                selected.append(c)
                total += cr
            if total >= 16:
                break
        if not selected:
            continue
        selected_ids = [c["id"] for c in selected]
        # Update those student_courses rows to passed
        # Supabase doesn't support bulk update with IN and body different per row; but here same status
        sb.table("student_courses").update({"status": "passed", "semester_taken": new_sem}).eq("student_id", sid).in_("course_id", selected_ids).execute()

    return {"status": "ok", "new_global_semester": new_sem, "students_updated": len(students)}


@router.post("/semester/set")
async def set_global_semester(value: int, user=Depends(get_current_user)):
    """Admin: set global semester to a specific value (no student updates)."""
    _require_admin(user)
    sb = get_supabase()
    cur = sb.table("semester_control").select("id").eq("slug", "U").limit(1).execute()
    if not cur.data:
        raise HTTPException(status_code=500, detail="semester_control not initialized")
    sc = cur.data[0]
    sb.table("semester_control").update({"current_semester": int(value)}).eq("id", sc["id"]).execute()
    return {"status": "ok", "current_semester": int(value)}


@router.post("/students/{student_id}/reset")
async def reset_student_progress(student_id: str, user=Depends(get_current_user)):
    """Admin or the owner can reset a student's progress:
    - Delete all student_courses rows
    - Set current_semester = 0
    """
    sb = get_supabase()
    # owner or admin only
    is_admin = (user.get("email", "").lower() in settings.ADMIN_EMAILS)
    if not is_admin:
        # check ownership
        s = sb.table("students").select("id, auth_user_id").eq("id", student_id).limit(1).execute()
        if not s.data:
            raise HTTPException(status_code=404, detail="Student not found")
        owner_auth_id = s.data[0].get("auth_user_id")
        if owner_auth_id != user.get("id"):
            raise HTTPException(status_code=403, detail="Not allowed")

    # delete student_courses
    sb.table("student_courses").delete().eq("student_id", student_id).execute()
    # set semester 0
    sb.table("students").update({"current_semester": 0}).eq("id", student_id).execute()
    return {"status": "ok", "student_id": student_id, "current_semester": 0}


@router.post("/students/{student_id}/recompute-semester")
async def recompute_semester(student_id: str, user=Depends(get_current_user)):
    """Recompute student's current_semester based on total passed credits.
    Rule: each semester is earned when accumulating at least 12 credits, up to 16 credits per semester bucket.
    We greedily group passed courses ordered by course.semester then code into buckets of size 12-16.
    """
    sb = get_supabase()
    # allow owner or admin
    is_admin = (user.get("email", "").lower() in settings.ADMIN_EMAILS)
    if not is_admin:
        s = sb.table("students").select("id, auth_user_id").eq("id", student_id).limit(1).execute()
        if not s.data:
            raise HTTPException(status_code=404, detail="Student not found")
        if s.data[0].get("auth_user_id") != user.get("id"):
            raise HTTPException(status_code=403, detail="Not allowed")

    rows = sb.table("student_courses").select("course_id, status").eq("student_id", student_id).execute()
    passed_ids = [r["course_id"] for r in (rows.data or []) if (r.get("status") or "").lower() in ("passed", "aprobada", "approved")]
    cmap = _course_details(sb, passed_ids)
    ordered = sorted([cmap[cid] for cid in passed_ids if cid in cmap], key=lambda c: (c.get("semester") or 99, c.get("code") or ""))

    semesters = 0
    bucket = 0
    for c in ordered:
        cr = int(c.get("credits") or 0)
        if bucket + cr <= 16:
            bucket += cr
        else:
            # close current bucket
            if bucket >= 12:
                semesters += 1
            # start new bucket with this course
            bucket = cr
    # close last bucket
    if bucket >= 12:
        semesters += 1

    sb.table("students").update({"current_semester": semesters}).eq("id", student_id).execute()
    return {"status": "ok", "student_id": student_id, "current_semester": semesters}
