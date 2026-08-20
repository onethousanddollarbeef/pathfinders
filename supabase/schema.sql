-- Auth: for instant sign-up (extension + website), disable **Confirm email** under
-- Authentication → Providers → Email. Verification emails are sent by Supabase
-- (default noreply@mail.app.supabase.io) or your custom SMTP — not by the extension.
-- The website already uses profiles, scholarships, user_scholarships, and related tables.
-- This file documents the extension sync model; run only if you are bootstrapping a fresh project.

-- Profiles: one row per auth user (id matches auth.users.id)
-- Columns used by the extension: id, email, full_name, gpa, major, grade_level, state,
-- phone, school, graduation_year, fafsa_completed, demographics (jsonb extension payload)

-- User scholarships: tracks saved/started/submitted per user
-- Status values: saved, started, planning, submitted

-- Scholarships: public catalog for Explore tab (extension reads with publishable key)

-- Optional legacy blob table (NOT used by nexusnext.lovable.app):
-- create table if not exists public.scholarpath_states (
--   user_id uuid primary key references auth.users(id) on delete cascade,
--   state jsonb not null default '{}'::jsonb,
--   updated_at timestamptz not null default now()
-- );
