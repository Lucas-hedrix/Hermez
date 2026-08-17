import { supabase } from '../supabase/client';

export const createActivity = async (type, creatorId, metadata = {}, visibility = 'private') => {
  const { data, error } = await supabase
    .from('activities')
    .insert({
      type,
      creator_id: creatorId,
      metadata,
      visibility,
      status: 'pending'
    })
    .select()
    .single();

  if (error) throw error;
  
  // Add creator as accepted participant
  await supabase
    .from('activity_participants')
    .insert({
      activity_id: data.id,
      user_id: creatorId,
      status: 'accepted'
    });

  return data;
};

export const inviteParticipant = async (activityId, userId) => {
  const { data, error } = await supabase
    .from('activity_participants')
    .insert({
      activity_id: activityId,
      user_id: userId,
      status: 'invited'
    })
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const updateParticipantStatus = async (activityId, userId, status) => {
  const { data, error } = await supabase
    .from('activity_participants')
    .update({ status })
    .eq('activity_id', activityId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const updateActivityState = async (activityId, metadata, status) => {
  const updates = {};
  if (metadata) updates.metadata = metadata;
  if (status) updates.status = status;

  const { data, error } = await supabase
    .from('activities')
    .update(updates)
    .eq('id', activityId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const logActivityEvent = async (activityId, userId, eventType, payload = {}) => {
  const { data, error } = await supabase
    .from('activity_events')
    .insert({
      activity_id: activityId,
      user_id: userId,
      event_type: eventType,
      payload
    })
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const fetchActivity = async (activityId) => {
  const { data: activity, error } = await supabase
    .from('activities')
    .select(`
      *,
      creator:users!activities_creator_id_fkey(id, name, username, photo_urls),
      participants:activity_participants(
        status, 
        score, 
        user:users!activity_participants_user_id_fkey(id, name, username, photo_urls)
      )
    `)
    .eq('id', activityId)
    .single();

  if (error) throw error;
  return activity;
};

export const subscribeToActivity = (activityId, onActivityUpdate, onEventReceived) => {
  const activityChannel = supabase.channel(`activity:${activityId}`);

  activityChannel
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'activities', filter: `id=eq.${activityId}` },
      (payload) => {
        onActivityUpdate?.(payload.new);
      }
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'activity_events', filter: `activity_id=eq.${activityId}` },
      (payload) => {
        onEventReceived?.(payload.new);
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'activity_participants', filter: `activity_id=eq.${activityId}` },
      (payload) => {
        // Trigger generic activity update on participant change to refetch or update state
        onActivityUpdate?.({ trigger: 'participant_change', payload });
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(activityChannel);
  };
};
