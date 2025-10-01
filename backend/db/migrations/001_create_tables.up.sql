CREATE TABLE user_progress (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  curriculum_id TEXT NOT NULL,
  completed_courses JSONB NOT NULL DEFAULT '[]'::jsonb,
  selected_courses JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, curriculum_id)
);

CREATE INDEX idx_user_progress_user_id ON user_progress(user_id);
CREATE INDEX idx_user_progress_curriculum_id ON user_progress(curriculum_id);
