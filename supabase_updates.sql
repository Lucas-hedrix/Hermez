-- =========================================================
-- 1. FRIENDSHIPS: block metadata
-- =========================================================

alter table friendships
add column if not exists blocked_by text references users(id) on delete set null,
add column if not exists blocked_at timestamptz;

-- Note: If your `status` column has a CHECK constraint (e.g., status IN ('pending', 'accepted', 'declined')),
-- you will need to update it to allow 'blocked'. 
-- For example:
-- ALTER TABLE friendships DROP CONSTRAINT IF EXISTS friendships_status_check;
-- ALTER TABLE friendships ADD CONSTRAINT friendships_status_check CHECK (status IN ('pending', 'accepted', 'declined', 'blocked'));

-- =========================================================
-- 2. FRIEND MESSAGES: soft delete support
-- =========================================================

alter table friend_messages
add column if not exists deleted_for_everyone boolean default false,
add column if not exists deleted_at timestamptz,
add column if not exists deleted_by text[] default '{}';

-- =========================================================
-- 3. BLOCKS TABLE
-- =========================================================

create table if not exists blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id text references users(id) on delete cascade not null,
  blocked_id text references users(id) on delete cascade not null,
  reason text,
  created_at timestamptz default now(),

  constraint blocks_no_self_block check (blocker_id <> blocked_id),
  constraint blocks_unique_pair unique (blocker_id, blocked_id)
);

alter table blocks enable row level security;

drop policy if exists "Users can create blocks" on blocks;
create policy "Users can create blocks"
on blocks for insert
with check (auth.uid()::text = blocker_id);

drop policy if exists "Users can view their own blocks" on blocks;
create policy "Users can view their own blocks"
on blocks for select
using (
  auth.uid()::text = blocker_id
  or auth.uid()::text = blocked_id
);

drop policy if exists "Users can remove their own blocks" on blocks;
create policy "Users can remove their own blocks"
on blocks for delete
using (auth.uid()::text = blocker_id);

-- =========================================================
-- 4. REPORTS TABLE
-- =========================================================

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id text references users(id) on delete cascade not null,
  reported_user_id text references users(id) on delete cascade not null,
  content_type text,
  content_id uuid,
  reason text not null,
  details text,
  status text default 'pending',
  created_at timestamptz default now(),

  constraint reports_no_self_report check (reporter_id <> reported_user_id),
  constraint reports_status_check check (
    status in ('pending', 'reviewed', 'dismissed', 'action_taken')
  )
);

alter table reports enable row level security;

drop policy if exists "Users can insert reports" on reports;
create policy "Users can insert reports"
on reports for insert
with check (auth.uid()::text = reporter_id);

drop policy if exists "Users can view their own reports" on reports;
create policy "Users can view their own reports"
on reports for select
using (auth.uid()::text = reporter_id);

-- =========================================================
-- 5. FRIENDSHIPS RLS: allow participants to block/update friendship
-- =========================================================

drop policy if exists "Participants can update friendships" on friendships;
create policy "Participants can update friendships"
on friendships for update
using (
  auth.uid()::text = requester_id
  or auth.uid()::text = recipient_id
)
with check (
  auth.uid()::text = requester_id
  or auth.uid()::text = recipient_id
);

-- =========================================================
-- 6. FRIEND_MESSAGES RLS: allow read receipts and soft deletes
-- =========================================================

drop policy if exists "Participants can update friend messages" on friend_messages;
create policy "Participants can update friend messages"
on friend_messages for update
using (
  exists (
    select 1
    from friendships f
    where f.id = friend_messages.friendship_id
    and (
      f.requester_id = auth.uid()::text
      or f.recipient_id = auth.uid()::text
    )
  )
)
with check (
  exists (
    select 1
    from friendships f
    where f.id = friend_messages.friendship_id
    and (
      f.requester_id = auth.uid()::text
      or f.recipient_id = auth.uid()::text
    )
  )
);

-- =========================================================
-- 7. INDEXES FOR PERFORMANCE
-- =========================================================

create index if not exists blocks_blocker_id_idx on blocks(blocker_id);
create index if not exists blocks_blocked_id_idx on blocks(blocked_id);
create index if not exists reports_reporter_id_idx on reports(reporter_id);
create index if not exists reports_reported_user_id_idx on reports(reported_user_id);
create index if not exists reports_status_idx on reports(status);
create index if not exists friend_messages_friendship_id_idx on friend_messages(friendship_id);
create index if not exists friend_messages_sender_id_idx on friend_messages(sender_id);
create index if not exists friendships_blocked_by_idx on friendships(blocked_by);
