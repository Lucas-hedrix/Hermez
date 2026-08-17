import { supabase } from '../supabase/client';
import { getSparkTemplate, sparkMessageForType } from '../constants/sparks';
import { sendMessageNotification, sendSparkNotification } from '../utils/notifications';

/**
 * Fetch spark state between current user and another user.
 */
export async function getSparkBetween(myUid, otherUid) {
  if (!myUid || !otherUid) return null;

  const { data, error } = await supabase
    .from('sparks')
    .select('id, sender_id, receiver_id, spark_type, custom_message, status, created_at, responded_at')
    .or(
      `and(sender_id.eq.${myUid},receiver_id.eq.${otherUid}),and(sender_id.eq.${otherUid},receiver_id.eq.${myUid})`
    )
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.log('[sparks] getSparkBetween:', error.message);
    return null;
  }
  return data;
}

/**
 * Fetch friendship between two users (any status).
 */
export async function getFriendshipBetween(myUid, otherUid) {
  if (!myUid || !otherUid) return null;

  const { data, error } = await supabase
    .from('friendships')
    .select('id, status, requester_id, recipient_id, created_at, blocked_by, blocked_at')
    .or(
      `and(requester_id.eq.${myUid},recipient_id.eq.${otherUid}),and(requester_id.eq.${otherUid},recipient_id.eq.${myUid})`
    )
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.log('[sparks] getFriendshipBetween:', error.message);
    return null;
  }
  return data;
}

/**
 * Send a spark to another user.
 */
export async function sendSpark({ senderId, receiverId, sparkType, customMessage }) {
  if (!senderId || !receiverId) {
    throw new Error('Missing user ids');
  }
  if (senderId === receiverId) {
    throw new Error('You cannot spark yourself');
  }

  // Already friends → no need for a spark; chat is available.
  const existingFriendship = await getFriendshipBetween(senderId, receiverId);
  if (existingFriendship?.status === 'accepted') {
    throw new Error("You're already connected — open Messages to chat.");
  }
  if (existingFriendship?.status === 'blocked') {
    throw new Error('Unable to send a spark to this person.');
  }

  const existingSpark = await getSparkBetween(senderId, receiverId);
  if (existingSpark?.status === 'accepted') {
    // Legacy: accepted spark without friendship — create friendship instead of a new spark.
    await ensureFriendship(senderId, receiverId);
    throw new Error("You're already connected — open Messages to chat.");
  }

  const message = sparkMessageForType(sparkType, customMessage);
  const template = getSparkTemplate(sparkType);

  const { data, error } = await supabase
    .from('sparks')
    .insert({
      sender_id: senderId,
      receiver_id: receiverId,
      spark_type: sparkType,
      custom_message: message,
      status: 'pending',
    })
    .select('id, sender_id, receiver_id, spark_type, custom_message, status, created_at')
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      throw new Error('You already have a pending spark with this person.');
    }
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Failed to send spark. It may have been blocked.');
  }

  const { data: sender } = await supabase
    .from('users')
    .select('name')
    .eq('id', senderId)
    .maybeSingle();

  const senderName = sender?.name || 'Someone';

  await supabase
    .from('notifications')
    .insert({
      recipient_id: receiverId,
      sender_id: senderId,
      type: 'spark',
      title: template.notificationTitle,
      message,
    })
    .then(({ error: nErr }) => {
      if (nErr) console.log('[sparks] notification insert:', nErr.message);
    });

  await sendSparkNotification(receiverId, senderName, message, senderId);

  return data;
}

/**
 * Incoming pending sparks for the current user.
 */
export async function fetchIncomingSparks(myUid) {
  const { data, error } = await supabase
    .from('sparks')
    .select('id, sender_id, receiver_id, spark_type, custom_message, status, created_at')
    .eq('receiver_id', myUid)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  if (!data?.length) return [];

  const senderIds = [...new Set(data.map((s) => s.sender_id))];
  const { data: users } = await supabase
    .from('users')
    .select('id, name, username, photo_urls, current_vibe, vibe_set_at')
    .in('id', senderIds);

  const userMap = Object.fromEntries((users ?? []).map((u) => [u.id, u]));
  return data.map((s) => ({ ...s, sender: userMap[s.sender_id] ?? null }));
}

/**
 * Outgoing pending sparks from the current user.
 */
export async function fetchOutgoingSparks(myUid) {
  const { data, error } = await supabase
    .from('sparks')
    .select('id, sender_id, receiver_id, spark_type, custom_message, status, created_at')
    .eq('sender_id', myUid)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  if (!data?.length) return [];

  const recipientIds = [...new Set(data.map((s) => s.receiver_id))];
  const { data: users } = await supabase
    .from('users')
    .select('id, name, username, photo_urls, current_vibe, vibe_set_at')
    .in('id', recipientIds);

  const userMap = Object.fromEntries((users ?? []).map((u) => [u.id, u]));
  return data.map((s) => ({ ...s, recipient: userMap[s.receiver_id] ?? null }));
}

/**
 * Ensure an accepted friendship exists between two users.
 * Used when a spark is accepted so chat + friends list work the same as Add Friend.
 * Does not upgrade blocked relationships.
 */
export async function ensureFriendship(userA, userB) {
  if (!userA || !userB || userA === userB) return null;

  const { data: existing } = await supabase
    .from('friendships')
    .select('id, status, requester_id, recipient_id, created_at, blocked_by, blocked_at')
    .or(
      `and(requester_id.eq.${userA},recipient_id.eq.${userB}),and(requester_id.eq.${userB},recipient_id.eq.${userA})`
    )
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.status === 'accepted') return existing;
  if (existing?.status === 'blocked') return existing;

  if (existing?.id) {
    const { data, error } = await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('id', existing.id)
      .select('id, status, requester_id, recipient_id, created_at, blocked_by, blocked_at')
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? { ...existing, status: 'accepted' };
  }

  // Accepter/current actor as requester so INSERT RLS (requester_id = auth.uid) passes.
  const { data, error } = await supabase
    .from('friendships')
    .insert({
      requester_id: userA,
      recipient_id: userB,
      status: 'accepted',
    })
    .select('id, status, requester_id, recipient_id, created_at, blocked_by, blocked_at')
    .maybeSingle();

  if (error) {
    // Race: another client created the row — re-fetch.
    if (error.code === '23505') {
      const again = await getFriendshipBetween(userA, userB);
      if (again?.status === 'accepted') return again;
      if (again?.id && again.status !== 'blocked') {
        const { data: updated, error: upErr } = await supabase
          .from('friendships')
          .update({ status: 'accepted' })
          .eq('id', again.id)
          .select('id, status, requester_id, recipient_id, created_at, blocked_by, blocked_at')
          .maybeSingle();
        if (upErr) throw new Error(upErr.message);
        return updated ?? { ...again, status: 'accepted' };
      }
    }
    throw new Error(error.message);
  }

  return data;
}

/**
 * Resolve a real friendship for chat. If only an accepted spark exists
 * (legacy path), create the friendship so Messages list + chat work.
 */
export async function resolveFriendshipForChat(myUid, otherUid) {
  if (!myUid || !otherUid) return null;

  let friendship = await getFriendshipBetween(myUid, otherUid);
  if (friendship?.status === 'accepted') return friendship;
  if (friendship?.status === 'blocked') return null;

  const spark = await getSparkBetween(myUid, otherUid);
  if (spark?.status === 'accepted') {
    friendship = await ensureFriendship(myUid, otherUid);
    if (friendship?.status === 'accepted') return friendship;
  }

  // Pending friendship is still usable for limited chat.
  if (friendship) return friendship;
  return null;
}

/**
 * Backfill: accepted sparks that never got a friendship row (older clients /
 * failed inserts) so they show up in the Messages friends list.
 */
export async function repairSparkFriendships(myUid) {
  if (!myUid) return 0;

  const { data: acceptedSparks, error } = await supabase
    .from('sparks')
    .select('id, sender_id, receiver_id, status')
    .eq('status', 'accepted')
    .or(`sender_id.eq.${myUid},receiver_id.eq.${myUid}`);

  if (error || !acceptedSparks?.length) return 0;

  let fixed = 0;
  for (const spark of acceptedSparks) {
    const otherId = spark.sender_id === myUid ? spark.receiver_id : spark.sender_id;
    try {
      const f = await ensureFriendship(myUid, otherId);
      if (f?.status === 'accepted') fixed += 1;
    } catch (e) {
      console.log('[sparks] repair friendship failed:', e.message);
    }
  }
  return fixed;
}

/**
 * Accept a received spark — creates connection (DB trigger) + friendship for chat.
 */
export async function acceptSpark(spark, myUid) {
  const { data, error } = await supabase
    .from('sparks')
    .update({ status: 'accepted' })
    .eq('id', spark.id)
    .eq('receiver_id', myUid)
    .eq('status', 'pending')
    .select()
    .maybeSingle();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error('Unable to update spark. Please try again.');
    }
    throw new Error(error.message);
  }
  if (!data) return { spark: null, friendship: null };

  // Always register as friends so chat + friends list + full profile access work.
  let friendship = null;
  try {
    friendship = await ensureFriendship(myUid, spark.sender_id);
  } catch (e) {
    console.log('[sparks] ensureFriendship on accept:', e.message);
    // Retry once with swapped order in case of RLS edge cases
    try {
      friendship = await ensureFriendship(spark.sender_id, myUid);
    } catch (e2) {
      console.log('[sparks] ensureFriendship retry failed:', e2.message);
      throw new Error(
        'Spark accepted, but could not create friendship for chat. Please try messaging from their profile.'
      );
    }
  }

  await supabase.from('notifications').insert({
    recipient_id: spark.sender_id,
    sender_id: myUid,
    type: 'spark',
    title: 'Spark accepted!',
    message: 'Your spark was accepted. You can message each other now.',
  });

  const { data: me } = await supabase.from('users').select('name').eq('id', myUid).maybeSingle();
  await sendMessageNotification(
    spark.sender_id,
    me?.name || 'Someone',
    'Accepted your spark — say hi!',
    myUid
  );

  return { spark: data, friendship };
}

/**
 * Ignore a received spark.
 */
export async function ignoreSpark(sparkId, myUid) {
  const { data, error } = await supabase
    .from('sparks')
    .update({ status: 'ignored' })
    .eq('id', sparkId)
    .eq('receiver_id', myUid)
    .eq('status', 'pending')
    .select()
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return data;
}

export async function countPendingIncomingSparks(myUid) {
  const { count, error } = await supabase
    .from('sparks')
    .select('id', { count: 'exact', head: true })
    .eq('receiver_id', myUid)
    .eq('status', 'pending');

  if (error) return 0;
  return count ?? 0;
}
