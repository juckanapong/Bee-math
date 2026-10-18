-- =====================================================================
-- BeeMath · ระยะ 3: XP ลีกที่เซิร์ฟเวอร์ตรวจ (แบบ Duolingo)
-- วิธีใช้: SQL Editor › New query › วางทั้งไฟล์นี้ › Run (รันซ้ำได้)
--         ต้องรัน schema.sql, league.sql และ league_v2.sql มาก่อนแล้ว
--         แล้ว deploy ฟังก์ชัน supabase/functions/session-submit (ดู README หัวข้อ "XP ลีกที่เซิร์ฟเวอร์ตรวจ")
--
-- หลักการ
-- - แอปแจ้งเริ่มรอบ (session_begin) พร้อม id และ seed เซิร์ฟเวอร์บันทึกเวลาเริ่มเอง
-- - จบรอบ แอปส่งคำตอบไปที่ Edge Function session-submit ซึ่งสร้างโจทย์ชุดเดิมจาก seed ตรวจคำตอบ
--   คิด XP ด้วยกติกาเดียวกับแอป แล้วเรียก session_complete (ใช้ได้เฉพาะ service_role)
-- - XP ลีกมาจากรอบที่ตรวจแล้ว + รางวัลภารกิจที่ตรวจแล้ว (quest_claim) เท่านั้น
--   league_sync ไม่รับ XP จากแอปอีกต่อไป (ยังรับพารามิเตอร์ p_xp ไว้ให้แอปรุ่นเก่าเรียกได้ แต่ไม่ใช้)
-- - ส่งผลรอบเดิมซ้ำได้ (เช่นเน็ตหลุด) ได้ผลเดิม ไม่นับ XP ซ้ำ
-- - ยังคงเพดาน 300 XP ต่อวันที่ผ่านไปในสัปดาห์ (league_v2) ไว้เป็นด่านสุดท้าย
-- - ตารางทั้งหมดเปิด RLS โดยไม่มี policy = เข้าถึงได้ผ่านฟังก์ชันเท่านั้น
-- =====================================================================

-- รอบเรียน 1 รอบ (บทเรียน ด่านทดสอบ ฝึกฝน ระดับตำนาน ข้ามบท วัดระดับ เกมผึ้งเร่งรีบ เรื่องเล่า)
create table if not exists public.xp_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('lesson', 'test', 'practice', 'legend', 'jump', 'placement', 'timed', 'story')),
  seed bigint not null check (seed between 0 and 4294967295),
  begun_at timestamptz not null default now(),
  submitted_at timestamptz,
  xp integer check (xp >= 0),           -- XP ที่ได้จากรอบนี้ (รวม XP สองเท่าแล้ว)
  league_xp integer check (league_xp >= 0), -- XP ที่บวกเข้าลีกจริง (อาจน้อยกว่าเพราะเพดานรายวัน)
  boosted boolean not null default false,
  result jsonb                          -- สรุปผลการตรวจ หรือเหตุผลที่ไม่ผ่านการตรวจ
);
create index if not exists xp_sessions_user on public.xp_sessions (user_id, begun_at desc);

-- สถิติรายวัน (เวลาประเทศไทย) ใช้ตรวจภารกิจประจำวัน
create table if not exists public.xp_daily (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  xp integer not null default 0 check (xp >= 0),      -- XP จากรอบเรียน (ไม่รวมรางวัลภารกิจ เหมือนในแอป)
  solved integer not null default 0 check (solved >= 0), -- แก้สมการถูก
  bar integer not null default 0 check (bar >= 0),       -- ทำโจทย์บาร์โมเดล
  perfect integer not null default 0 check (perfect >= 0), -- จบบทเรียน/ด่านทดสอบโดยไม่ผิด
  claimed text[] not null default '{}',                -- ภารกิจที่รับรางวัลแล้ว
  primary key (user_id, day)
);

-- ช่วงเวลา XP สองเท่า (จากร้านค้าหรือหีบสมบัติ)
create table if not exists public.xp_boosts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null check (source in ('shop', 'chest')),
  started_at timestamptz not null default now(),
  ends_at timestamptz not null
);
create index if not exists xp_boosts_user on public.xp_boosts (user_id, ends_at desc);

alter table public.xp_sessions enable row level security;
alter table public.xp_daily enable row level security;
alter table public.xp_boosts enable row level security;

-- ---------- ลีก: แยกการเข้ากลุ่มออกมาใช้ร่วมกัน ----------
-- ตัดสินสัปดาห์ที่จบแล้ว แล้วพาผู้เล่นเข้ากลุ่มของสัปดาห์นี้ (ถ้ายังไม่มี) คืนค่า id กลุ่ม
create or replace function public.league_join(p_user uuid) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  cur date := (date_trunc('week', now() at time zone 'Asia/Bangkok'))::date;
  my_tier smallint;
  gid bigint;
begin
  perform public.league_settle_due(cur);
  insert into public.league_status (user_id) values (p_user) on conflict (user_id) do nothing;
  select tier into my_tier from public.league_status where user_id = p_user;
  select group_id into gid from public.league_members where user_id = p_user and week_key = cur;
  if gid is null then
    select g.id into gid
      from public.league_groups g
      where g.week_key = cur and g.tier = my_tier and not g.settled
        and (select count(*) from public.league_members m where m.group_id = g.id) < 100
      order by g.id
      limit 1;
    if gid is null then
      insert into public.league_groups (week_key, tier) values (cur, my_tier) returning id into gid;
    end if;
    insert into public.league_members (group_id, user_id, week_key)
      values (gid, p_user, cur) on conflict (user_id, week_key) do nothing;
    select group_id into gid from public.league_members where user_id = p_user and week_key = cur;
  end if;
  return gid;
end;
$$;
revoke all on function public.league_join(uuid) from public, anon, authenticated;

-- บวก XP ลีกของสัปดาห์นี้ (ไม่เกิน 300 ต่อวันที่ผ่านไปในสัปดาห์) คืนค่า XP ที่บวกได้จริง
create or replace function public.league_add(p_user uuid, p_xp integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  cur date := (date_trunc('week', now() at time zone 'Asia/Bangkok'))::date;
  cap integer := 300 * (((now() at time zone 'Asia/Bangkok')::date - cur) + 1);
  v_before integer;
  v_after integer;
begin
  if coalesce(p_xp, 0) <= 0 then
    return 0;
  end if;
  perform public.league_join(p_user);
  select xp into v_before from public.league_members where user_id = p_user and week_key = cur for update;
  v_after := greatest(v_before, least(cap, v_before + p_xp));
  update public.league_members set xp = v_after, updated_at = now() where user_id = p_user and week_key = cur;
  return v_after - v_before;
end;
$$;
revoke all on function public.league_add(uuid, integer) from public, anon, authenticated;

-- league_sync รุ่นใหม่: ไม่รับ XP จากแอปแล้ว (p_xp ไม่ถูกใช้) · คืนตารางอันดับเหมือนเดิม
create or replace function public.league_sync(p_week date, p_xp integer)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  cur date := (date_trunc('week', now() at time zone 'Asia/Bangkok'))::date;
  my_tier smallint;
  gid bigint;
  l_week date;
  l_rank integer;
  l_result smallint;
  l_from smallint;
  l_n integer;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  gid := public.league_join(uid);
  select tier into my_tier from public.league_status where user_id = uid;
  -- ผลของสัปดาห์ล่าสุดที่ตัดสินแล้ว
  select m.week_key, m.rank, m.result, g.tier, (select count(*) from public.league_members x where x.group_id = g.id)
    into l_week, l_rank, l_result, l_from, l_n
    from public.league_members m
    join public.league_groups g on g.id = m.group_id
    where m.user_id = uid and m.week_key < cur and g.settled
    order by m.week_key desc
    limit 1;
  return jsonb_build_object(
    'week', cur,
    'tier', my_tier,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('name', p.display_name, 'avatar', p.avatar, 'xp', m.xp, 'me', m.user_id = uid)
                       order by m.xp desc, m.joined_at)
      from public.league_members m
      join public.profiles p on p.id = m.user_id
      where m.group_id = gid
    ), '[]'::jsonb),
    'result', case when l_week is null then null else jsonb_build_object(
      'week', l_week, 'rank', l_rank, 'n', l_n, 'from', l_from,
      'to', least(4, greatest(0, l_from + l_result))) end
  );
end;
$$;
revoke all on function public.league_sync(date, integer) from public, anon;
grant execute on function public.league_sync(date, integer) to authenticated;

-- ---------- เริ่มรอบ (เรียกจากแอป) ----------
-- id และ seed มาจากแอป · เวลาเริ่มมาจากเซิร์ฟเวอร์ · เริ่มได้ไม่เกิน 500 รอบต่อวัน
create or replace function public.session_begin(p_id uuid, p_kind text, p_seed bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'Asia/Bangkok')::date;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  if (select count(*) from public.xp_sessions
      where user_id = uid and begun_at >= (today::timestamp at time zone 'Asia/Bangkok')) >= 500 then
    raise exception 'session limit';
  end if;
  insert into public.xp_sessions (id, user_id, kind, seed) values (p_id, uid, p_kind, p_seed)
    on conflict (id) do nothing;
end;
$$;
revoke all on function public.session_begin(uuid, text, bigint) from public, anon;
grant execute on function public.session_begin(uuid, text, bigint) to authenticated;

-- ---------- XP สองเท่า (เรียกจากแอป) ----------
-- 15 นาทีต่อครั้ง ไม่เกิน 3 ครั้งต่อวัน (ราคาในร้านค้าเก็บในเครื่อง เซิร์ฟเวอร์จึงจำกัดจำนวนครั้งแทน)
create or replace function public.boost_begin(p_source text) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'Asia/Bangkok')::date;
  v_end timestamptz := now() + interval '15 minutes';
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  if (select count(*) from public.xp_boosts
      where user_id = uid and started_at >= (today::timestamp at time zone 'Asia/Bangkok')) >= 3 then
    raise exception 'boost limit';
  end if;
  insert into public.xp_boosts (user_id, source, ends_at) values (uid, p_source, v_end);
  return v_end;
end;
$$;
revoke all on function public.boost_begin(text) from public, anon;
grant execute on function public.boost_begin(text) to authenticated;

-- ---------- อ่านรอบเพื่อตรวจ (เฉพาะ Edge Function) ----------
create or replace function public.session_get(p_user uuid, p_id uuid) returns jsonb
language sql security definer set search_path = '' as $$
  select jsonb_build_object('kind', s.kind, 'seed', s.seed, 'submitted', s.submitted_at is not null,
           'elapsed_ms', floor(extract(epoch from (now() - s.begun_at)) * 1000)::bigint,
           'xp', s.xp, 'league_xp', s.league_xp, 'boosted', s.boosted)
  from public.xp_sessions s where s.id = p_id and s.user_id = p_user;
$$;
revoke all on function public.session_get(uuid, uuid) from public, anon, authenticated;
grant execute on function public.session_get(uuid, uuid) to service_role;

-- ---------- บันทึกผลรอบที่ตรวจแล้ว (เฉพาะ Edge Function) ----------
-- p_xp = XP ตามกติกา (ก่อนคูณสอง) · p_stats = { solved, bar, perfect } สำหรับภารกิจ · p_result = สรุปผลการตรวจ
create or replace function public.session_complete(p_user uuid, p_id uuid, p_xp integer, p_stats jsonb, p_result jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.xp_sessions%rowtype;
  cur date := (date_trunc('week', now() at time zone 'Asia/Bangkok'))::date;
  v_day date;
  v_xp integer := least(200, greatest(0, coalesce(p_xp, 0)));
  v_boosted boolean := false;
  v_added integer := 0;
begin
  select * into s from public.xp_sessions where id = p_id for update;
  if not found or s.user_id <> p_user then
    raise exception 'unknown session';
  end if;
  if s.submitted_at is not null then
    return jsonb_build_object('xp', s.xp, 'league_xp', s.league_xp, 'boosted', s.boosted, 'duplicate', true);
  end if;
  -- ทดสอบวัดระดับได้ XP ครั้งเดียวต่อบัญชี
  if s.kind = 'placement' and v_xp > 0 and exists (
      select 1 from public.xp_sessions x where x.user_id = p_user and x.kind = 'placement' and x.xp > 0) then
    v_xp := 0;
  end if;
  -- XP สองเท่า: มีช่วงเวลา boost ที่ทับกับช่วงที่ทำรอบนี้
  if v_xp > 0 and exists (
      select 1 from public.xp_boosts b where b.user_id = p_user and b.started_at <= now() and b.ends_at >= s.begun_at) then
    v_xp := v_xp * 2;
    v_boosted := true;
  end if;
  v_day := (s.begun_at at time zone 'Asia/Bangkok')::date;
  insert into public.xp_daily as d (user_id, day, xp, solved, bar, perfect)
    values (p_user, v_day, v_xp,
            least(500, greatest(0, coalesce((p_stats ->> 'solved')::integer, 0))),
            least(500, greatest(0, coalesce((p_stats ->> 'bar')::integer, 0))),
            least(1, greatest(0, coalesce((p_stats ->> 'perfect')::integer, 0))))
    on conflict (user_id, day) do update
      set xp = d.xp + excluded.xp, solved = d.solved + excluded.solved,
          bar = d.bar + excluded.bar, perfect = d.perfect + excluded.perfect;
  -- นับเข้าลีกเฉพาะรอบที่เริ่มในสัปดาห์นี้
  if v_xp > 0 and date_trunc('week', v_day)::date = cur then
    v_added := public.league_add(p_user, v_xp);
  end if;
  update public.xp_sessions
    set submitted_at = now(), xp = v_xp, league_xp = v_added, boosted = v_boosted, result = p_result
    where id = p_id;
  return jsonb_build_object('xp', v_xp, 'league_xp', v_added, 'boosted', v_boosted);
end;
$$;
revoke all on function public.session_complete(uuid, uuid, integer, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.session_complete(uuid, uuid, integer, jsonb, jsonb) to service_role;

-- ---------- รับรางวัลภารกิจ (เฉพาะ Edge Function ซึ่งส่งเป้าหมายและรางวัลจาก QUESTS ใน js/data.js) ----------
-- p_metric: xp · solved · bar · perfect · รับได้เฉพาะวันนี้และเมื่อวาน (เวลาประเทศไทย) วันละครั้งต่อภารกิจ
create or replace function public.quest_claim(p_user uuid, p_day date, p_quest text, p_metric text, p_goal integer, p_reward integer)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  cur date := (date_trunc('week', now() at time zone 'Asia/Bangkok'))::date;
  today date := (now() at time zone 'Asia/Bangkok')::date;
  r public.xp_daily%rowtype;
  v_value integer;
  v_added integer := 0;
begin
  if p_day is null or p_day < today - 1 or p_day > today then
    raise exception 'claim expired';
  end if;
  select * into r from public.xp_daily where user_id = p_user and day = p_day for update;
  if not found then
    raise exception 'quest not done';
  end if;
  v_value := case p_metric when 'xp' then r.xp when 'solved' then r.solved when 'bar' then r.bar when 'perfect' then r.perfect end;
  if v_value is null or v_value < p_goal then
    raise exception 'quest not done';
  end if;
  if p_quest = any (r.claimed) then
    return jsonb_build_object('xp', p_reward, 'league_xp', 0, 'duplicate', true);
  end if;
  update public.xp_daily set claimed = array_append(claimed, p_quest) where user_id = p_user and day = p_day;
  if date_trunc('week', p_day)::date = cur then
    v_added := public.league_add(p_user, least(100, greatest(0, p_reward)));
  end if;
  return jsonb_build_object('xp', p_reward, 'league_xp', v_added);
end;
$$;
revoke all on function public.quest_claim(uuid, date, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.quest_claim(uuid, date, text, text, integer, integer) to service_role;
