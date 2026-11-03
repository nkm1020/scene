-- 3D figures: per pose an image (Muse Image) and a mesh (SAM 3D). Listener reactions per line (Spark).
alter table members add column if not exists figure jsonb;          -- {"neutral":{"img":url,"glb":url}, "happy":{...}, ...}
alter table members add column if not exists figure_status text;    -- drawing | lifting | ready | failed
alter table renders add column if not exists reactions jsonb;       -- [{"member_id","pose","look"}]
insert into storage.buckets (id, name, public) values ('figures','figures', true) on conflict (id) do nothing;

-- Atomic merge of one pose into members.figure (poses finish in parallel).
create or replace function merge_figure(m uuid, pose text, val jsonb) returns void
language sql security definer set search_path = public as $$
  update members set figure = coalesce(figure, '{}'::jsonb) || jsonb_build_object(pose, val) where id = m;
$$;
revoke all on function merge_figure(uuid, text, jsonb) from public, anon, authenticated;
