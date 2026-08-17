-- Let an activity participant read the participant list for that same activity.
-- This lets an invitee reopen the existing game without exposing unrelated
-- activities or reintroducing the activities/activity_participants RLS loop.

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

DROP POLICY IF EXISTS "Users can view participants for their activities" ON public.activity_participants;
CREATE POLICY "Users can view participants for their activities"
  ON public.activity_participants FOR SELECT
  USING (
    public.is_activity_creator(activity_id)
    OR public.is_activity_participant(activity_id)
    OR user_id = auth.uid()::text
  );
