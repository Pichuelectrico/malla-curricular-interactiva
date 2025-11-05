import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import db from "../db";

export interface LoadProgressRequest {
  curriculumId: string;
}

export interface ProgressData {
  completedCourses: string[];
  selectedCourses: string[];
  inProgressCourses?: string[];
  plannedCourses?: string[];
  hasWritingIntensive?: boolean;
  lastUpdated?: string;
}

export interface LoadProgressResponse extends ProgressData {}

export const loadProgress = api<LoadProgressRequest, LoadProgressResponse>(
  { auth: true, expose: true, method: "GET", path: "/progress/load/:curriculumId" },
  async (req) => {
    const auth = getAuthData()!;

    const row = await db.queryRow<{
      completed_courses: string;
      selected_courses: string;
    }>`
      SELECT completed_courses, selected_courses
      FROM user_progress
      WHERE user_id = ${auth.userID} AND curriculum_id = ${req.curriculumId}
    `;

    if (!row) {
      return {
        completedCourses: [],
        selectedCourses: [],
        inProgressCourses: [],
        plannedCourses: [],
        hasWritingIntensive: false,
        lastUpdated: new Date().toISOString()
      };
    }

    return {
      completedCourses: JSON.parse(row.completed_courses),
      selectedCourses: JSON.parse(row.selected_courses),
      inProgressCourses: [],
      plannedCourses: [],
      hasWritingIntensive: false,
      lastUpdated: new Date().toISOString()
    };
  }
);
