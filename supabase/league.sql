-- =====================================================================
-- BeeMath · ระยะ 2b: ลีกรายสัปดาห์กับผู้เล่นจริง
-- วิธีใช้: รัน supabase/schema.sql ก่อน แล้ว SQL Editor › New query › วางทั้งไฟล์นี้ › Run (รันซ้ำได้)
--
-- หลักการ
-- - สัปดาห์เริ่มวันจันทร์ 00:00 เวลาประเทศไทย (Asia/Bangkok)
-- - ผู้เล่นถูกจัดเข้ากลุ่มละไม่เกิน 20 คน ในลีกระดับเดียวกัน (0 ผึ้งน้อย … 4 นางพญา)
-- - เซิร์ฟเวอร์เป็นผู้ตัดสินเลื่อน/ตกลีก: 25% แรกของกลุ่มเลื่อนขึ้น (ต้องมี XP > 0)
--   3 อันดับท้ายตกลีก (เฉพาะกลุ่มที่มีอย่างน้อย 10 คน)
-- - ตัดสินแบบ "ขี้เกียจ": กลุ่มของสัปดาห์ที่จบแล้วจะถูกตัดสินเมื่อมีคนเรียก league_sync ครั้งแรกของสัปดาห์ใหม่
--   (ไม่ต้องตั้ง pg_cron)
-- - กัน XP ปลอมเบื้องต้น: รับ XP สัปดาห์ได้ไม่เกิน 600 ต่อวันที่ผ่านไปในสัปดาห์ และ XP ไม่ลดลง
-- - ตารางทั้งหมดเปิด RLS โดยไม่มี policy = เข้าถึงได้ผ่านฟังก์ชัน league_sync เท่านั้น
-- =====================================================================

-- ระดับลีกปัจจุบันของผู้เล่น (เปลี่ยนได้โดยเซิร์ฟเวอร์เท่านั้น)
create table if not exists public.league_status (
  user_id uuid primary key references auth.users (id) on delete cascade,
  tier smallint not null default 0 check (tier between 0 and 4),
  updated_at timestamptz not null default now()
);

create table if not exists public.league_groups (
  id bigint generated always as identity primary key,
  week_key date not null,
  tier smallint not null check (tier between 0 and 4),
  settled boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists league_groups_open on public.league_groups (week_key, tier) where not settled;

create table if not exists public.league_members (
  group_id bigint not null references public.league_groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  week_key date not null,
  xp integer not null default 0 check (xp >= 0),
  rank integer,
  result smallint not null default 0 check (result between -1 and 1),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, week_key)
);
create index if not exists league_members_group on public.league_members (group_id);

alter table public.league_status enable row level security;
alter table public.league_groups enable row level security;
alter table public.league_members enable row level security;

-- ตัดสินทุกกลุ่มของสัปดาห์ที่จบแล้วที่ยังไม่ได้ตัดสิน
create or replace function public.league_settle_due(cur date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  g record;
  n integer;
  up integer;
begin
  for g in
    select id, tier from public.league_groups
    where not settled and week_key < cur
    order by id
    for update skip locked
  loop
    select count(*) into n from public.league_members where group_id = g.id;
    up := greatest(1, round(n * 0.25))::integer;
    with ranked as (
      select user_id, xp, row_number() over (order by xp desc, joined_at) as rn
      from public.league_members where group_id = g.id
    )
    update public.league_members m
      set rank = r.rn,
          result = case
            when r.rn <= up and r.xp > 0 and g.tier < 4 then 1
            when n >= 10 and r.rn > n - 3 and g.tier > 0 then -1
            else 0
          end
      from ranked r
      where m.group_id = g.id and m.user_id = r.user_id;
    update public.league_status s
      set tier = least(4, greatest(0, s.tier + m.result)), updated_at = now()
      from public.league_members m
      where m.group_id = g.id and m.user_id = s.user_id and m.result <> 0;
    update public.league_groups set settled = true where id = g.id;
  end loop;
end;
$$;
revoke all on function public.league_settle_due(date) from public, anon, authenticated;

-- เรียกจากแอปทุกครั้งที่ซิงก์: ส่ง XP ของสัปดาห์ แล้วได้ตารางอันดับของกลุ่มกลับไป
-- คืนค่า: { week, tier, members: [{ name, avatar, xp, me }], result: { week, rank, n, from, to } | null }
create or replace function public.league_sync(p_week date, p_xp integer)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  cur date := (date_trunc('week', now() at time zone 'Asia/Bangkok'))::date;
  my_tier smallint;
  gid bigint;
  cap integer;
  l_week date;
  l_rank integer;
  l_result smallint;
  l_from smallint;
  l_n integer;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;

  perform public.league_settle_due(cur);

  insert into public.league_status (user_id) values (uid) on conflict (user_id) do nothing;
  select tier into my_tier from public.league_status where user_id = uid;

  -- เข้ากลุ่มของสัปดาห์นี้ (ถ้ายังไม่มี): หากลุ่มระดับเดียวกันที่ยังไม่เต็ม หรือสร้างใหม่
  select group_id into gid from public.league_members where user_id = uid and week_key = cur;
  if gid is null then
    select g.id into gid
      from public.league_groups g
      where g.week_key = cur and g.tier = my_tier and not g.settled
        and (select count(*) from public.league_members m where m.group_id = g.id) < 20
      order by g.id
      limit 1;
    if gid is null then
      insert into public.league_groups (week_key, tier) values (cur, my_tier) returning id into gid;
    end if;
    insert into public.league_members (group_id, user_id, week_key)
      values (gid, uid, cur) on conflict (user_id, week_key) do nothing;
    select group_id into gid from public.league_members where user_id = uid and week_key = cur;
  end if;

  -- บันทึก XP (เฉพาะสัปดาห์ปัจจุบัน) พร้อมเพดานกันโกงและไม่ให้ลดลง
  if p_week = cur and p_xp is not null and p_xp > 0 then
    cap := 600 * (((now() at time zone 'Asia/Bangkok')::date - cur) + 1);
    update public.league_members
      set xp = greatest(xp, least(p_xp, cap)), updated_at = now()
      where user_id = uid and week_key = cur;
  end if;

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
