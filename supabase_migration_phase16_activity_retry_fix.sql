-- Allow the existing Activity Engine retry/accept flow to update its own game.
-- Participant checks use the security-definer helpers from the activity RLS fix,
-- so these policies do not recurse through activity_participants.

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

DROP POLICY IF EXISTS "Users can update their own participant status" ON public.activity_participants;
DROP POLICY IF EXISTS "Participants and creators can update activity participant status" ON public.activity_participants;
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
