-- Fix Activity Engine RLS recursion.
-- The original policies made activities read activity_participants while
-- activity_participants read activities. These helpers run as the database
-- owner, so the two policy checks do not re-enter each other through RLS.

CREATE OR REPLACE FUNCTION public.is_activity_creator(p_activity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.activities
    WHERE id = p_activity_id
      AND creator_id = auth.uid()::text
  );
$$;

CREATE OR REPLACE FUNCTION public.is_activity_participant(p_activity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.activity_participants
    WHERE activity_id = p_activity_id
      AND user_id = auth.uid()::text
  );
$$;

DROP POLICY IF EXISTS "Users can view activities they are part of or are public/friends" ON public.activities;
CREATE POLICY "Users can view activities they are part of or are public/friends"
  ON public.activities FOR SELECT
  USING (
    visibility = 'public'
    OR creator_id = auth.uid()::text
    OR public.is_activity_participant(id)
  );

DROP POLICY IF EXISTS "Activity creators can update their activities" ON public.activities;
DROP POLICY IF EXISTS "Activity participants can update their activities" ON public.activities;
CREATE POLICY "Activity participants can update their activities"
  ON public.activities FOR UPDATE
  USING (
    creator_id = auth.uid()::text
    OR public.is_activity_participant(id)
  )
  WITH CHECK (
    creator_id = auth.uid()::text
    OR public.is_activity_participant(id)
  );

DROP POLICY IF EXISTS "Users can view participants for their activities" ON public.activity_participants;
CREATE POLICY "Users can view participants for their activities"
  ON public.activity_participants FOR SELECT
  USING (
    public.is_activity_creator(activity_id)
    OR public.is_activity_participant(activity_id)
    OR user_id = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can update their own participant status" ON public.activity_participants;
CREATE POLICY "Participants and creators can update activity participant status"
  ON public.activity_participants FOR UPDATE
  USING (
    user_id = auth.uid()::text
    OR public.is_activity_creator(activity_id)
  )
  WITH CHECK (
    user_id = auth.uid()::text
    OR public.is_activity_creator(activity_id)
  );

DROP POLICY IF EXISTS "Creators can add participants" ON public.activity_participants;
CREATE POLICY "Creators can add participants"
  ON public.activity_participants FOR INSERT
  WITH CHECK (
    public.is_activity_creator(activity_id)
    OR user_id = auth.uid()::text
  );
