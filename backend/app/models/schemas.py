from typing import List, Optional
from pydantic import BaseModel, Field


class CourseIn(BaseModel):
    id: str
    code: str
    title: str
    description: Optional[str] = None
    credits: int
    semester: int
    block: Optional[str] = None
    area: Optional[str] = None
    type: Optional[str] = None
    prerequisites: List[str] = []
    alternatives: List[str] = []


class ImportPayload(BaseModel):
    source_file: Optional[str] = None
    last_modified: Optional[str] = Field(default=None, alias="Last-Modified")
    courses: List[CourseIn]

    class Config:
        populate_by_name = True


class ValidateRequest(BaseModel):
    course_id: str


class SuggestRequest(BaseModel):
    max_credits: int = 16
