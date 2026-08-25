-- Run this once in Supabase Dashboard → SQL Editor.
-- It enables live updates for the shared climbing calendar tables.

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.climb_sessions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.climb_participants;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.climb_members;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.climb_gyms;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
