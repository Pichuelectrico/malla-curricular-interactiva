-- Supabase schema for malla-curricular-interactiva
-- Execute in Supabase SQL editor or psql

create table if not exists public.careers (
  id uuid primary key default gen_random_uuid(),
  name text unique not null
);

create table if not exists public.courses (
  id text primary key,                -- use existing course id (e.g., CMP1001)
  code text not null,
  title text not null,
  description text,
  credits int not null default 0,
  semester int,
  block text,
  area text,
  type text
);

create table if not exists public.curricula (
  id uuid primary key default gen_random_uuid(),
  career_id uuid not null references public.careers(id) on delete cascade,
  course_id text not null references public.courses(id) on delete cascade,
  unique (career_id, course_id)
);

create table if not exists public.prerequisites (
  id uuid primary key default gen_random_uuid(),
  course_id text not null references public.courses(id) on delete cascade,
  prerequisite_id text not null references public.courses(id) on delete cascade,
  unique (course_id, prerequisite_id)
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,          -- Supabase auth.users.id
  name text,
  email text unique,
  career_id uuid references public.careers(id) on delete set null,
  current_semester int not null default 0
);

create table if not exists public.student_courses (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  course_id text not null references public.courses(id) on delete cascade,
  semester_taken int,
  grade numeric(4,2),
  status text,                       -- e.g., planned, enrolled, passed, failed
  unique (student_id, course_id)
);

-- Helpful index
create index if not exists idx_prereq_course on public.prerequisites(course_id);
create index if not exists idx_prereq_pre on public.prerequisites(prerequisite_id);
create index if not exists idx_curricula_career on public.curricula(career_id);
create index if not exists idx_student_courses_student on public.student_courses(student_id);

-- Optional: RPC function used by metrics endpoint
create or replace function public.enrollment_estimate_by_course(p_course_id text)
returns table(estimate int)
language plpgsql
as $$
begin
  return query
  select coalesce(count(*) filter (where lower(sc.status) in ('passed','aprobada','approved','enrolled')), 0)::int as estimate
  from public.student_courses sc
  where sc.course_id = p_course_id;
end;
$$;

-- Enable Row Level Security (Supabase usually has it on by default)
alter table public.students enable row level security;
alter table public.student_courses enable row level security;

-- Policies: students can read/update their own profile
create policy if not exists "Students can view own profile"
  on public.students for select
  using (auth.uid() = auth_user_id);

create policy if not exists "Students can update own profile"
  on public.students for update
  using (auth.uid() = auth_user_id);

-- Policies: student_courses rows tied to student's profile
create policy if not exists "Students can read own student_courses"
  on public.student_courses for select
  using (exists (
    select 1 from public.students s
    where s.id = student_courses.student_id and s.auth_user_id = auth.uid()
  ));

create policy if not exists "Students can insert own student_courses"
  on public.student_courses for insert
  with check (exists (
    select 1 from public.students s
    where s.id = student_courses.student_id and s.auth_user_id = auth.uid()
  ));

create policy if not exists "Students can update own student_courses"
  on public.student_courses for update
  using (exists (
    select 1 from public.students s
    where s.id = student_courses.student_id and s.auth_user_id = auth.uid()
  ));

-- Global semester control table
create table if not exists public.semester_control (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null default 'U', -- unique identifier e.g., 'U'
  current_semester int not null default 0,
  updated_at timestamptz not null default now()
);

-- Seed singleton row if empty (safe to run multiple times)
insert into public.semester_control (slug, current_semester)
select 'U', 0
where not exists (select 1 from public.semester_control where slug = 'U');
