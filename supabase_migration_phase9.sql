-- Fix for notification deletion silently failing due to missing RLS policy
CREATE POLICY "Users can delete their own notifications" 
ON notifications FOR DELETE 
USING (recipient_id = auth.uid()::text);
