-- Scene schema. Messages are text. The only stored media: one persona image and one voice reference per member.
-- Browsers read rooms/members/messages/renders (anon key, read-only) and subscribe via Realtime.
-- Every write goes through Next.js server routes with the service role. Member secrets live in a table anon cannot read.

create table if not exists rooms (
  id text primary key,
  name text not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references rooms(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 24),
  persona_url text,
  persona_spec jsonb,
  enrolled_voice boolean not null default false,
  preset text not null default 'female_a',
  is_seed boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists members_room on members(room_id);

create table if not exists member_secrets (
  member_id uuid primary key references members(id) on delete cascade,
  secret_hash text not null,
  voice_path text,
  voice_text text
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references rooms(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  seq bigint generated always as identity,
  text text not null check (char_length(text) between 1 and 280),
  created_at timestamptz not null default now()
);
create index if not exists messages_room_seq on messages(room_id, seq);

create table if not exists renders (
  message_id uuid primary key references messages(id) on delete cascade,
  room_id text not null references rooms(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','verified','captions_only','silent')),
  audio_url text,
  duration_ms int,
  envelope jsonb,
  similarity real,
  heard text,
  attempts jsonb,
  flags text[] not null default '{}',
  emotion text not null default 'neutral',
  gesture text not null default 'none',
  camera text not null default 'room',
  pause_ms int not null default 300,
  direction_source text not null default 'rules',
  updated_at timestamptz not null default now()
);
create index if not exists renders_room on renders(room_id);

create table if not exists ledger (
  id bigint generated always as identity primary key,
  room_id text,
  model text not null,
  op text not null,
  ms int not null,
  usd numeric(12,7) not null default 0,
  ok boolean not null,
  input_tokens int,
  output_tokens int,
  reasoning_tokens int,
  audio_ms int,
  note text,
  at timestamptz not null default now()
);
create index if not exists ledger_room on ledger(room_id);

alter table rooms enable row level security;
alter table members enable row level security;
alter table member_secrets enable row level security;
alter table messages enable row level security;
alter table renders enable row level security;
alter table ledger enable row level security;

drop policy if exists "read rooms" on rooms;
create policy "read rooms" on rooms for select to anon, authenticated using (true);
drop policy if exists "read members" on members;
create policy "read members" on members for select to anon, authenticated using (true);
drop policy if exists "read messages" on messages;
create policy "read messages" on messages for select to anon, authenticated using (true);
drop policy if exists "read renders" on renders;
create policy "read renders" on renders for select to anon, authenticated using (true);
-- member_secrets and ledger: no anon policies (server only).

do $$ begin
  begin alter publication supabase_realtime add table messages; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table renders; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table members; exception when duplicate_object then null; end;
end $$;
alter table renders replica identity full;
alter table members replica identity full;

insert into storage.buckets (id, name, public) values ('personas','personas', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('renders','renders', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('voices','voices', false) on conflict (id) do nothing;
