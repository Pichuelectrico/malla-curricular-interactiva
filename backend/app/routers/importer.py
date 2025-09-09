from fastapi import APIRouter, Depends, HTTPException
from ..db.supabase_client import get_supabase
from ..models.schemas import ImportPayload, CourseIn
from ..core.auth import get_current_user

router = APIRouter()


def _normalize_course(c: CourseIn):
    return {
        "id": c.id,
        "code": c.code,
        "title": c.title,
        "credits": c.credits,
        "semester": c.semester,
        "block": c.block,
        "area": c.area,
        "type": c.type,
    }


@router.post("/career/{career_name}")
async def import_career(career_name: str, payload: ImportPayload, user=Depends(get_current_user)):
    """Import JSON structure for a single career into Supabase tables.
    - Creates or upserts career
    - Upserts all courses
    - Creates curricula links for courses belonging to the career
    - Inserts prerequisite relations
    """
    sb = get_supabase()

    # 1) Upsert career
    try:
        career_res = sb.table("careers").upsert({"name": career_name}).select("id").execute()
        if not career_res.data:
            raise HTTPException(status_code=500, detail="Failed to upsert career")
        career_id = career_res.data[0]["id"]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Career upsert error: {e}")

    # 2) Upsert courses in batches
    try:
        courses_rows = [_normalize_course(CourseIn(**c.model_dump())) if isinstance(c, CourseIn) else _normalize_course(CourseIn(**c)) for c in payload.courses]
        # Upsert by id to avoid duplicates
        for chunk_start in range(0, len(courses_rows), 500):
            chunk = courses_rows[chunk_start:chunk_start + 500]
            sb.table("courses").upsert(chunk, on_conflict="id").execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Courses upsert error: {e}")

    # 3) curricula links and prerequisites
    try:
        # curricula links
        curricula_rows = [{"career_id": career_id, "course_id": c["id"]} for c in courses_rows]
        for chunk_start in range(0, len(curricula_rows), 500):
            chunk = curricula_rows[chunk_start:chunk_start + 500]
            sb.table("curricula").upsert(chunk, on_conflict="career_id,course_id").execute()

        # prerequisites
        prereq_rows = []
        for c in payload.courses:
            c_obj = c if isinstance(c, CourseIn) else CourseIn(**c)
            for pre in c_obj.prerequisites:
                prereq_rows.append({
                    "course_id": c_obj.id,
                    "prerequisite_id": pre
                })
        if prereq_rows:
            for chunk_start in range(0, len(prereq_rows), 500):
                chunk = prereq_rows[chunk_start:chunk_start + 500]
                sb.table("prerequisites").upsert(chunk, on_conflict="course_id,prerequisite_id").execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Relations insert error: {e}")

    return {"status": "ok", "career_id": career_id, "courses": len(courses_rows)}
