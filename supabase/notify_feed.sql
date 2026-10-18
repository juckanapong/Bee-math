-- =====================================================================
-- BeeMath · ระยะ 6: แจ้งเตือน Push · ฟีดความเคลื่อนไหวของเพื่อน
-- วิธีใช้: SQL Editor › New query › วางทั้งไฟล์นี้ › Run (รันซ้ำได้) · ต้องรัน friends.sql และ league_v3.sql มาก่อนแล้ว
--         การตั้งเวลาส่งแจ้งเตือน (pg_cron) ดู README หัวข้อ "แจ้งเตือน Push"
--
-- แจ้งเตือน Push
-- - แอปเก็บการสมัครรับแจ้งเตือนของแต่ละเครื่อง (push_subs) พร้อมเวลาที่ผู้เรียนเลือก
-- - Edge Function push-send (ทุก 15 นาที) ขอรายชื่อที่ถึงเวลาจาก push_due แล้วส่ง จากนั้นบันทึกด้วย push_mark
-- - ส่งเฉพาะคนที่ยังไม่ได้เรียนวันนี้ · ไม่เกินวันละ 1 ครั้งต่อเครื่อง · ไม่ส่งช่วง 21:00–07:00 (เวลาประเทศไทย)
--
-- ฟีดเพื่อน
-- - เหตุการณ์: ผ่านด่านทดสอบ/ระดับตำนาน (Edge Function บันทึกจากรอบที่ตรวจแล้ว) · เลื่อนลีก (บันทึกตอนตัดสินลีก)
--   · สตรีคถึงก้าวสำคัญ/ครบเป้าหมายสตรีค (แอปแจ้ง)
-- - เห็นได้เฉพาะเจ้าของและเพื่อน · ให้กำลังใจได้คนละ 1 ครั้งต่อเหตุการณ์ · ไม่มีข้อความอิสระ
-- =====================================================================

-- ---------- แจ้งเตือน Push ----------
create table if not exists public.push_subs (
  endpoint text primary key check (endpoint ~ '^https://' and char_length(endpoint) < 1000),
  user_id uuid not null references auth.users (id) on delete cascade,
  p256dh text not null check (char_length(p256dh) < 200),
  auth text not null check (char_length(auth) < 100),
  remind_time time not null default '19:00',
  enabled boolean not null default true,
  last_sent date,
  updated_at timestamptz not null default now()
);
create index if not exists push_subs_user on public.push_subs (user_id);
alter table public.push_subs enable row level security;

-- บันทึก/อัปเดตการสมัครของเครื่องนี้ (ไม่เกิน 10 เครื่องต่อบัญชี)
create or replace function public.push_save(p_endpoint text, p_p256dh text, p_auth text, p_time text, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.push_subs where endpoint = p_endpoint)
     and (select count(*) from public.push_subs where user_id = uid) >= 10 then
    delete from public.push_subs where endpoint = (select endpoint from public.push_subs where user_id = uid order by updated_at limit 1);
  end if;
  insert into public.push_subs as s (endpoint, user_id, p256dh, auth, remind_time, enabled)
    values (p_endpoint, uid, p_p256dh, p_auth, p_time::time, p_on)
    on conflict (endpoint) do update
      set user_id = uid, p256dh = excluded.p256dh, auth = excluded.auth,
          remind_time = excluded.remind_time, enabled = excluded.enabled, updated_at = now();
end;
$$;
revoke all on function public.push_save(text, text, text, text, boolean) from public, anon;
grant execute on function public.push_save(text, text, text, text, boolean) to authenticated;

create or replace function public.push_remove(p_endpoint text) returns void
language sql security definer set search_path = '' as $$
  delete from public.push_subs where endpoint = p_endpoint and user_id = auth.uid();
$$;
revoke all on function public.push_remove(text) from public, anon;
grant execute on function public.push_remove(text) to authenticated;

-- เครื่องที่ถึงเวลาเตือน (เฉพาะ Edge Function push-send)
create or replace function public.push_due() returns table (endpoint text, p256dh text, auth text, streak integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  now_t time := (now() at time zone 'Asia/Bangkok')::time;
  today date := public.bkk_today();
begin
  if now_t < '07:00' or now_t >= '21:00' then
    return; -- ช่วงเวลาพักผ่อน
  end if;
  return query
    select s.endpoint, s.p256dh, s.auth, coalesce(public.live_streak(s.user_id), 0)
    from public.push_subs s
    left join public.progress pr on pr.user_id = s.user_id
    where s.enabled and s.remind_time <= now_t and (s.last_sent is null or s.last_sent < today)
      and coalesce(pr.state ->> 'lastDay', '') <> today::text
      and not exists (select 1 from public.xp_daily d where d.user_id = s.user_id and d.day = today and d.xp > 0)
    order by s.remind_time
    limit 500;
end;
$$;
revoke all on function public.push_due() from public, anon, authenticated;
grant execute on function public.push_due() to service_role;

-- บันทึกผลการส่ง: sent = ส่งแล้ววันนี้ · gone = การสมัครหมดอายุ (ลบทิ้ง)
create or replace function public.push_mark(p_sent text[], p_gone text[]) returns void
language sql security definer set search_path = '' as $$
  update public.push_subs set last_sent = public.bkk_today() where endpoint = any (p_sent);
  delete from public.push_subs where endpoint = any (p_gone);
$$;
revoke all on function public.push_mark(text[], text[]) from public, anon, authenticated;
grant execute on function public.push_mark(text[], text[]) to service_role;

-- ---------- ฟีดเพื่อน ----------
create table if not exists public.feed_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('unit', 'legend', 'league', 'streak', 'goal')),
  data jsonb not null default '{}',
  dedupe text not null,                 -- กันเหตุการณ์ซ้ำ เช่น unit:3 · league:2026-10-12
  created_at timestamptz not null default now(),
  unique (user_id, dedupe)
);
create index if not exists feed_events_recent on public.feed_events (user_id, created_at desc);
create table if not exists public.feed_kudos (
  event_id bigint not null references public.feed_events (id) on delete cascade,
  from_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, from_id)
);
alter table public.feed_events enable row level security;
alter table public.feed_kudos enable row level security;

-- เพิ่มเหตุการณ์ (ใช้ภายใน: Edge Function และตัวตัดสินลีก)
create or replace function public.feed_add(p_user uuid, p_kind text, p_data jsonb, p_dedupe text) returns void
language sql security definer set search_path = '' as $$
  insert into public.feed_events (user_id, kind, data, dedupe) values (p_user, p_kind, coalesce(p_data, '{}'), p_dedupe)
  on conflict (user_id, dedupe) do nothing;
$$;
revoke all on function public.feed_add(uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.feed_add(uuid, text, jsonb, text) to service_role;

-- เลื่อนลีกตอนตัดสินสัปดาห์ → เหตุการณ์ "league" (ทริกเกอร์ ไม่ต้องแก้ league_settle_due)
create or replace function public.feed_on_promote() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  t public.league_tiers%rowtype;
begin
  if new.result = 1 and old.result is distinct from 1 then
    select lt.* into t from public.league_groups g join public.league_tiers lt on lt.tier = g.tier + 1 where g.id = new.group_id;
    if found then
      perform public.feed_add(new.user_id, 'league', jsonb_build_object('tier', t.tier, 'name', t.name), 'league:' || new.week_key);
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists feed_promote on public.league_members;
create trigger feed_promote after update of result on public.league_members
  for each row execute function public.feed_on_promote();

-- แอปแจ้ง: สตรีคถึงก้าวสำคัญ (7 30 100 365) หรือครบเป้าหมายสตรีค (7 14 30 50)
-- (สตรีคคำนวณในเครื่อง จึงตรวจได้แค่ค่าที่อนุญาตและไม่ซ้ำภายในสัปดาห์)
create or replace function public.feed_post_streak(p_kind text, p_days integer) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  if not ((p_kind = 'streak' and p_days in (7, 30, 100, 365)) or (p_kind = 'goal' and p_days in (7, 14, 30, 50))) then
    raise exception 'bad feed event';
  end if;
  perform public.feed_add(uid, p_kind, jsonb_build_object('days', p_days),
    p_kind || ':' || p_days || ':' || (date_trunc('week', now() at time zone 'Asia/Bangkok'))::date);
end;
$$;
revoke all on function public.feed_post_streak(text, integer) from public, anon;
grant execute on function public.feed_post_streak(text, integer) to authenticated;

-- ฟีดของฉัน: เหตุการณ์ 14 วันล่าสุดของตัวเองและเพื่อน (สูงสุด 30 รายการ)
create or replace function public.friends_feed() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id, 'kind', e.kind, 'data', e.data, 'at', e.created_at, 'me', e.user_id = uid,
      'name', p.display_name, 'avatar', p.avatar,
      'kudos', (select count(*) from public.feed_kudos k where k.event_id = e.id),
      'gave', exists (select 1 from public.feed_kudos k where k.event_id = e.id and k.from_id = uid)
    ) order by e.created_at desc)
    from (select * from public.feed_events ev
          where ev.created_at > now() - interval '14 days'
            and (ev.user_id = uid or public.are_friends(uid, ev.user_id))
          order by ev.created_at desc limit 30) e
    join public.profiles p on p.id = e.user_id), '[]'::jsonb);
end;
$$;
revoke all on function public.friends_feed() from public, anon;
grant execute on function public.friends_feed() to authenticated;

-- ให้กำลังใจเหตุการณ์ของเพื่อน (คนละครั้ง · ของตัวเองไม่ได้)
create or replace function public.feed_kudos_give(p_event bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  owner uuid;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select user_id into owner from public.feed_events where id = p_event;
  if owner is null or owner = uid or not public.are_friends(uid, owner) then raise exception 'not allowed'; end if;
  insert into public.feed_kudos (event_id, from_id) values (p_event, uid) on conflict do nothing;
end;
$$;
revoke all on function public.feed_kudos_give(bigint) from public, anon;
grant execute on function public.feed_kudos_give(bigint) to authenticated;
