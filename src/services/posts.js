import { supabase } from '../supabase/client';

/**
 * Who may delete this post (author, circle owner, circle mod).
 */
export async function canDeletePost(post, myUid, { circleOwnerId, myCircleRole } = {}) {
  if (!post || !myUid) return false;
  if (post.user_id === myUid) return true;
  if (!post.circle_id) return false;
  if (circleOwnerId && circleOwnerId === myUid) return true;
  if (myCircleRole === 'owner' || myCircleRole === 'moderator') return true;
  return false;
}

/**
 * Resolve circle mod permissions when not passed in.
 */
async function resolveCirclePerms(post, myUid) {
  if (!post.circle_id) return { circleOwnerId: null, myCircleRole: null };

  const [{ data: circle }, { data: member }] = await Promise.all([
    supabase.from('circles').select('owner_id').eq('id', post.circle_id).maybeSingle(),
    supabase
      .from('circle_members')
      .select('role')
      .eq('circle_id', post.circle_id)
      .eq('user_id', myUid)
      .maybeSingle(),
  ]);

  return {
    circleOwnerId: circle?.owner_id ?? null,
    myCircleRole: member?.role ?? null,
  };
}

export async function deletePost(post, myUid, circleContext) {
  const ctx =
    circleContext ??
    (await resolveCirclePerms(post, myUid));

  const allowed = await canDeletePost(post, myUid, ctx);
  if (!allowed) {
    throw new Error('You do not have permission to delete this post.');
  }

  const { error } = await supabase.from('posts').delete().eq('id', post.id);
  if (error) throw new Error(error.message);
  return true;
}
