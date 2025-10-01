import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import db from "../db";

export interface SaveProgressRequest {
  curriculumId: string;
  completedCourses: string[];
  selectedCourses: string[];
}

export const saveProgress = api<SaveProgressRequest, void>(
  { auth: true, expose: true, method: "POST", path: "/progress/save" },
  async (req) => {
    const auth = getAuthData()!;

    await db.exec`
      INSERT INTO user_progress (user_id, curriculum_id, completed_courses, selected_courses, updated_at)
      VALUES (${auth.userID}, ${req.curriculumId}, ${JSON.stringify(req.completedCourses)}, ${JSON.stringify(req.selectedCourses)}, NOW())
      ON CONFLICT (user_id, curriculum_id)
      DO UPDATE SET
        completed_courses = ${JSON.stringify(req.completedCourses)},
        selected_courses = ${JSON.stringify(req.selectedCourses)},
        updated_at = NOW()
    `;
  }
);
