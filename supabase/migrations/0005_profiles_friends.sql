-- One person across rooms. A profile is its owner's member row in a private home room (rooms.kind = 'home'):
-- the figure and voice pipelines run on it unchanged, and every seat that person takes in another room links back
-- to it (members.profile_id) and is kept in step with it (same figure, same voice reference, same secret).
alter table rooms add column if not exists kind text not null default 'group';   -- home | group | dm | demo
alter table rooms add column if not exists set jsonb;                           -- {"theme":"cafe"} or {"said","spec","urls"}
update rooms set kind = 'demo' where is_demo and kind = 'group';
alter table members add column if not exists profile_id uuid references members(id) on delete cascade;
alter table members add column if not exists friend_code text unique;
create index if not exists members_profile on members(profile_id);

-- Friends: a request, then an answer. Accepting opens the two of them a room of their own.
create table if not exists friendships (
  id uuid primary key default gen_random_uuid(),
  from_profile uuid not null references members(id) on delete cascade,
  to_profile uuid not null references members(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  room_id text references rooms(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (from_profile, to_profile)
);
alter table friendships enable row level security; -- server only

-- A pose lands on the profile and on every seat linked to it, in the same statement.
create or replace function merge_figure(m uuid, pose text, val jsonb) returns void
language sql security definer set search_path = public as $$
  update members set figure = coalesce(figure, '{}'::jsonb) || jsonb_build_object(pose, val) where id = m or profile_id = m;
$$;
revoke all on function merge_figure(uuid, text, jsonb) from public, anon, authenticated;

-- A room's set (theme) changes for everyone at the table.
do $$ begin
  begin alter publication supabase_realtime add table rooms; exception when duplicate_object then null; end;
end $$;
alter table rooms replica identity full;
