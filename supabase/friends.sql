-- =====================================================================
-- BeeMath · ระยะ 2c: เพื่อน · สตรีคเพื่อน · ภารกิจคู่หู
-- วิธีใช้: รัน schema.sql และ league.sql ก่อน แล้ว SQL Editor › New query › วางทั้งไฟล์นี้ › Run (รันซ้ำได้)
--
-- ความปลอดภัย (ผู้ใช้ส่วนใหญ่เป็นนักเรียน)
-- - เพิ่มเพื่อนด้วยรหัสเพื่อน แล้วอีกฝ่ายต้อง "ยอมรับ" ก่อนจึงเป็นเพื่อนกัน
-- - ส่งได้เฉพาะข้อความสำเร็จรูป (ส่งกำลังใจ / เตือนให้มาเรียน) ไม่มีข้อความอิสระ · จำกัดชนิดละ 1 ครั้งต่อวันต่อเพื่อน
-- - เพื่อนเห็นเฉพาะ: ชื่อที่แสดง สีอวตาร สตรีค เรียนวันนี้แล้วหรือยัง XP ของสัปดาห์ และสตรีคคู่
-- - ทุกตารางเปิด RLS โดยไม่มี policy = เข้าถึงได้ผ่านฟังก์ชันด้านล่างเท่านั้น
-- =====================================================================

-- รหัสเพื่อน เช่น BEE-7KQ2M (ไม่มีตัวที่สับสนง่าย เช่น 0/O 1/I)
alter table public.profiles add column if not exists friend_code text;
create unique index if not exists profiles_friend_code on public.profiles (friend_code);

create or replace function public.new_friend_code() returns text
language plpgsql set search_path = '' as $$
declare
  alphabet text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  code text;
begin
  loop
    code := 'BEE-';
    for i in 1..5 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where friend_code = code);
  end loop;
  return code;
end;
$$;
update public.profiles set friend_code = public.new_friend_code() where friend_code is null;

-- ผู้ใช้แก้ได้เฉพาะชื่อและสีอวตารของตัวเอง (รหัสเพื่อนเปลี่ยนได้โดยเซิร์ฟเวอร์เท่านั้น)
revoke update on public.profiles from authenticated;
grant update (display_name, avatar) on public.profiles to authenticated;

-- ผู้สมัครใหม่ได้รหัสเพื่อนอัตโนมัติ (แทนที่ฟังก์ชันจาก schema.sql)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, friend_code)
  values (new.id, coalesce(left(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 20), 'ผู้เรียน'), public.new_friend_code())
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ความเป็นเพื่อน: เก็บคู่เดียว (user_a < user_b) · pending = รอตอบรับ
create table if not exists public.friendships (
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  requested_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index if not exists friendships_b on public.friendships (user_b);

create table if not exists public.friend_messages (
  id bigint generated always as identity primary key,
  from_id uuid not null references auth.users (id) on delete cascade,
  to_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('cheer', 'nudge')),
  day date not null default (now() at time zone 'Asia/Bangkok')::date,
  seen boolean not null default false,
  created_at timestamptz not null default now(),
  unique (from_id, to_id, kind, day)
);
create index if not exists friend_messages_to on public.friend_messages (to_id, seen);

-- ภารกิจคู่หู: 1 คนมีได้ 1 ภารกิจต่อสัปดาห์ เป้าหมาย = XP รวมกันของสองคน
create table if not exists public.friend_quests (
  week_key date not null,
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  target integer not null default 300,
  created_at timestamptz not null default now(),
  primary key (week_key, user_a, user_b),
  check (user_a < user_b)
);

alter table public.friendships enable row level security;
alter table public.friend_messages enable row level security;
alter table public.friend_quests enable row level security;

-- ---------- ตัวช่วย ----------
create or replace function public.bkk_today() returns date
language sql stable set search_path = '' as $$ select (now() at time zone 'Asia/Bangkok')::date $$;

create or replace function public.are_friends(x uuid, y uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.friendships
    where user_a = least(x, y) and user_b = greatest(x, y) and status = 'accepted')
$$;

-- สตรีคของผู้ใช้ที่ยังมีผลอยู่ (ถ้าเรียนล่าสุดก่อนเมื่อวาน ถือว่าขาดแล้ว)
create or replace function public.live_streak(u uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select case when (p.state ->> 'lastDay')::date >= public.bkk_today() - 1 then p.streak else 0 end
  from public.progress p where p.user_id = u
$$;

-- สตรีคคู่: จำนวนวันติดกันที่ทั้งสองคนเรียน (นับจากวันนี้ หรือเมื่อวานถ้าวันนี้ยังเรียนไม่ครบทั้งคู่)
create or replace function public.friend_streak(x uuid, y uuid) returns integer
language plpgsql stable security definer set search_path = '' as $$
declare
  dx jsonb; dy jsonb;
  d date := public.bkk_today();
  n integer := 0;
begin
  select state -> 'days' into dx from public.progress where user_id = x;
  select state -> 'days' into dy from public.progress where user_id = y;
  if dx is null or dy is null then return 0; end if;
  if not (dx ->> d::text = 'learn' and dy ->> d::text = 'learn') then d := d - 1; end if;
  while n < 3650 and dx ->> d::text = 'learn' and dy ->> d::text = 'learn' loop
    n := n + 1;
    d := d - 1;
  end loop;
  return n;
end;
$$;

create or replace function public.week_xp_of(u uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce((select xp from public.league_members
    where user_id = u and week_key = (date_trunc('week', now() at time zone 'Asia/Bangkok'))::date), 0)
$$;

revoke all on function public.are_friends(uuid, uuid) from public, anon, authenticated;
revoke all on function public.live_streak(uuid) from public, anon, authenticated;
revoke all on function public.friend_streak(uuid, uuid) from public, anon, authenticated;
revoke all on function public.week_xp_of(uuid) from public, anon, authenticated;
revoke all on function public.new_friend_code() from public, anon, authenticated;

-- ---------- ฟังก์ชันที่แอปเรียก ----------

-- ภาพรวมทั้งหมดของหน้าเพื่อน
create or replace function public.friends_overview() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  cur date := (date_trunc('week', now() at time zone 'Asia/Bangkok'))::date;
  today text := public.bkk_today()::text;
  my_code text;
  q public.friend_quests%rowtype;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select friend_code into my_code from public.profiles where id = uid;
  if my_code is null then
    update public.profiles set friend_code = public.new_friend_code() where id = uid returning friend_code into my_code;
  end if;
  select * into q from public.friend_quests where week_key = cur and (user_a = uid or user_b = uid) limit 1;
  return jsonb_build_object(
    'code', my_code,
    'friends', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'name', o.display_name, 'avatar', o.avatar,
        'streak', coalesce(public.live_streak(o.id), 0),
        'today', coalesce((select pr.state -> 'days' ->> today = 'learn' from public.progress pr where pr.user_id = o.id), false),
        'week_xp', public.week_xp_of(o.id),
        'pair_streak', public.friend_streak(uid, o.id)
      ) order by o.display_name)
      from public.friendships f
      join public.profiles o on o.id = case when f.user_a = uid then f.user_b else f.user_a end
      where (f.user_a = uid or f.user_b = uid) and f.status = 'accepted'), '[]'::jsonb),
    'incoming', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.display_name, 'avatar', o.avatar))
      from public.friendships f join public.profiles o on o.id = f.requested_by
      where (f.user_a = uid or f.user_b = uid) and f.status = 'pending' and f.requested_by <> uid), '[]'::jsonb),
    'outgoing', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.display_name, 'avatar', o.avatar))
      from public.friendships f
      join public.profiles o on o.id = case when f.user_a = uid then f.user_b else f.user_a end
      where (f.user_a = uid or f.user_b = uid) and f.status = 'pending' and f.requested_by = uid), '[]'::jsonb),
    'inbox', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'name', o.display_name, 'avatar', o.avatar, 'at', m.created_at, 'seen', m.seen) order by m.created_at desc)
      from (select * from public.friend_messages where to_id = uid order by created_at desc limit 20) m
      join public.profiles o on o.id = m.from_id), '[]'::jsonb),
    'quest', case when q.week_key is null then null else (
      select jsonb_build_object(
        'week', cur, 'target', q.target,
        'partner_id', o.id, 'partner_name', o.display_name, 'partner_avatar', o.avatar,
        'mine', public.week_xp_of(uid), 'theirs', public.week_xp_of(o.id))
      from public.profiles o where o.id = case when q.user_a = uid then q.user_b else q.user_a end) end
  );
end;
$$;

-- ส่งคำขอเป็นเพื่อนด้วยรหัส · ถ้าอีกฝ่ายเคยขอเรามาแล้ว จะเป็นเพื่อนกันทันที
-- คืนค่า: sent · accepted · already · self · not_found · limit
create or replace function public.friend_request(p_code text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  other uuid;
  f public.friendships%rowtype;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select id into other from public.profiles where friend_code = upper(trim(p_code));
  if other is null then return 'not_found'; end if;
  if other = uid then return 'self'; end if;
  select * into f from public.friendships where user_a = least(uid, other) and user_b = greatest(uid, other);
  if found then
    if f.status = 'accepted' then return 'already'; end if;
    if f.requested_by = uid then return 'sent'; end if;
    update public.friendships set status = 'accepted' where user_a = f.user_a and user_b = f.user_b;
    return 'accepted';
  end if;
  if (select count(*) from public.friendships where (user_a = uid or user_b = uid)) >= 100 then return 'limit'; end if;
  insert into public.friendships (user_a, user_b, requested_by) values (least(uid, other), greatest(uid, other), uid);
  return 'sent';
end;
$$;

-- ตอบรับ/ปฏิเสธคำขอ
create or replace function public.friend_respond(p_user uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_accept then
    update public.friendships set status = 'accepted'
      where user_a = least(uid, p_user) and user_b = greatest(uid, p_user) and status = 'pending' and requested_by = p_user;
  else
    delete from public.friendships
      where user_a = least(uid, p_user) and user_b = greatest(uid, p_user) and status = 'pending';
  end if;
end;
$$;

-- เลิกเป็นเพื่อน (หรือยกเลิกคำขอที่ส่งไป) และยกเลิกภารกิจคู่หูสัปดาห์นี้กับคนนั้น
create or replace function public.friend_remove(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  delete from public.friendships where user_a = least(uid, p_user) and user_b = greatest(uid, p_user);
  delete from public.friend_quests where user_a = least(uid, p_user) and user_b = greatest(uid, p_user)
    and week_key = (date_trunc('week', now() at time zone 'Asia/Bangkok'))::date;
end;
$$;

-- ส่งข้อความสำเร็จรูปให้เพื่อน (ชนิดละ 1 ครั้งต่อวันต่อเพื่อน) · คืนค่า: sent · already · not_friend
create or replace function public.friend_send(p_user uuid, p_kind text) returns text
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_kind not in ('cheer', 'nudge') then raise exception 'bad kind'; end if;
  if not public.are_friends(uid, p_user) then return 'not_friend'; end if;
  insert into public.friend_messages (from_id, to_id, kind) values (uid, p_user, p_kind)
    on conflict (from_id, to_id, kind, day) do nothing;
  if found then return 'sent'; end if;
  return 'already';
end;
$$;

-- เริ่มภารกิจคู่หูสัปดาห์นี้กับเพื่อน · คืนค่า: started · busy (มีคนใดคนหนึ่งมีภารกิจแล้ว) · not_friend
create or replace function public.friend_quest_start(p_user uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  cur date := (date_trunc('week', now() at time zone 'Asia/Bangkok'))::date;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if not public.are_friends(uid, p_user) then return 'not_friend'; end if;
  if exists (select 1 from public.friend_quests where week_key = cur
             and (user_a in (uid, p_user) or user_b in (uid, p_user))) then
    return 'busy';
  end if;
  insert into public.friend_quests (week_key, user_a, user_b) values (cur, least(uid, p_user), greatest(uid, p_user));
  return 'started';
end;
$$;

-- ทำเครื่องหมายว่าอ่านข้อความแล้ว
create or replace function public.inbox_seen() returns void
language sql security definer set search_path = '' as $$
  update public.friend_messages set seen = true where to_id = auth.uid() and not seen
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'friends_overview()', 'friend_request(text)', 'friend_respond(uuid, boolean)', 'friend_remove(uuid)',
    'friend_send(uuid, text)', 'friend_quest_start(uuid)', 'inbox_seen()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end;
$$;
