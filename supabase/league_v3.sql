-- =====================================================================
-- BeeMath · ลีก v3 (ระยะ 4): กติกาลีกเป็นข้อมูลบนเซิร์ฟเวอร์ · รางวัลอันดับ · รีแอ็กชัน · จุด "เพิ่งเรียน"
-- วิธีใช้: SQL Editor › New query › วางทั้งไฟล์นี้ › Run (รันซ้ำได้) · ต้องรัน sessions.sql มาก่อนแล้ว
--
-- เปลี่ยนอะไร
-- - ตาราง league_tiers: ชื่อ ไอคอน สี และกติกาของแต่ละระดับ (ขนาดกลุ่ม · สัดส่วนที่เลื่อนขึ้น · จำนวนที่ตกลีก · รางวัล)
--   เพิ่มระดับใหม่ = เพิ่มแถว (tier ถัดไป) ไม่ต้องแก้โค้ด · แก้กติกา = แก้แถว (มีผลกับการตัดสินครั้งถัดไป)
-- - ตัดสินสัปดาห์: อันดับต้น ๆ ได้น้ำหวานตาม rewards (ต้องมี XP > 0) แอปเพิ่มน้ำหวานให้ตอนผู้เล่นกดรับผล
-- - รีแอ็กชัน: ไอคอนที่ผู้เล่นเลือกแสดงข้างชื่อตัวเองในตารางลีก (เลือกจากชุดที่กำหนด ไม่มีข้อความอิสระ)
-- - league_sync ส่งรายชื่อระดับ กติกาของกลุ่มตอนนี้ เวลาจบสัปดาห์ รีแอ็กชัน และจุด "เพิ่งเรียน" (ได้ XP ลีกใน 15 นาที)
-- =====================================================================

create table if not exists public.league_tiers (
  tier smallint primary key check (tier >= 0),
  name text not null check (char_length(name) between 1 and 30),
  icon text not null default 'trophy',          -- ชื่อไอคอนใน js/icons.js
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  ink text not null check (ink ~ '^#[0-9A-Fa-f]{6}$'),
  max_size integer not null default 100 check (max_size between 5 and 500),     -- คนต่อกลุ่ม
  promote_pct numeric not null default 0.25 check (promote_pct between 0 and 1), -- สัดส่วนอันดับต้นที่เลื่อนขึ้น (อย่างน้อย 1 คน)
  demote_count integer not null default 3 check (demote_count >= 0),           -- จำนวนอันดับท้ายที่ตกลีก
  demote_min_size integer not null default 10 check (demote_min_size >= 2),    -- กลุ่มต้องมีอย่างน้อยกี่คนจึงมีคนตกลีก
  rewards jsonb not null default '[]'                                          -- [{ "rank": 1, "nectar": 50 }, ...]
);
alter table public.league_tiers enable row level security;
-- ค่าเริ่มต้น = กติกาเดิม (ไม่ทับค่าที่แก้ไว้แล้วเมื่อรันซ้ำ)
insert into public.league_tiers (tier, name, icon, color, ink, rewards) values
  (0, 'ผึ้งน้อย', 'egg', '#FFE08A', '#2A1F14', '[{"rank":1,"nectar":50},{"rank":2,"nectar":30},{"rank":3,"nectar":20}]'),
  (1, 'ผึ้งงาน', 'bee', '#58C23A', '#0F2E09', '[{"rank":1,"nectar":50},{"rank":2,"nectar":30},{"rank":3,"nectar":20}]'),
  (2, 'ผึ้งสำรวจ', 'compass', '#2F6FED', '#FFFFFF', '[{"rank":1,"nectar":60},{"rank":2,"nectar":40},{"rank":3,"nectar":25}]'),
  (3, 'ผึ้งองครักษ์', 'shield', '#FF7A1A', '#2A1F14', '[{"rank":1,"nectar":60},{"rank":2,"nectar":40},{"rank":3,"nectar":25}]'),
  (4, 'นางพญา', 'crown', '#2A1F14', '#FFC21A', '[{"rank":1,"nectar":80},{"rank":2,"nectar":50},{"rank":3,"nectar":30}]')
on conflict (tier) do nothing;

-- ระดับลีกไม่ตายตัวที่ 0–4 อีกต่อไป: อ้างอิงตาราง league_tiers แทน
alter table public.league_status drop constraint if exists league_status_tier_check;
alter table public.league_groups drop constraint if exists league_groups_tier_check;
alter table public.progress drop constraint if exists progress_league_tier_check;
alter table public.progress drop constraint if exists progress_league_tier_range;
alter table public.progress add constraint progress_league_tier_range check (league_tier between 0 and 50);
alter table public.league_status drop constraint if exists league_status_tier_fk;
alter table public.league_status add constraint league_status_tier_fk foreign key (tier) references public.league_tiers (tier);
alter table public.league_groups drop constraint if exists league_groups_tier_fk;
alter table public.league_groups add constraint league_groups_tier_fk foreign key (tier) references public.league_tiers (tier);

-- รางวัลของสัปดาห์ที่ตัดสินแล้ว และรีแอ็กชันของผู้เล่น
alter table public.league_members add column if not exists reward integer not null default 0;
alter table public.league_status add column if not exists reaction text;
alter table public.league_status drop constraint if exists league_status_reaction_check;
alter table public.league_status add constraint league_status_reaction_check
  check (reaction is null or reaction in ('flame', 'star', 'bolt', 'heart', 'flower', 'trophy'));

-- กติกาของกลุ่มขนาด n ในระดับ p_tier: { up, down, rewards } (ใช้ทั้งตอนแสดงผลและตอนตัดสิน ให้ตรงกันเสมอ)
create or replace function public.league_rules(p_tier smallint, n integer) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'up', case when t.tier >= (select max(tier) from public.league_tiers) or n = 0 then 0
               else greatest(1, round(n * t.promote_pct))::integer end,
    'down', case when t.tier = 0 or n < t.demote_min_size then 0 else least(t.demote_count, n) end,
    'rewards', t.rewards,
    'max', t.max_size)
  from public.league_tiers t where t.tier = p_tier;
$$;
revoke all on function public.league_rules(smallint, integer) from public, anon, authenticated;

-- ตัดสินทุกกลุ่มของสัปดาห์ที่จบแล้ว ตามกติกาของระดับนั้น
create or replace function public.league_settle_due(cur date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  g record;
  n integer;
  rules jsonb;
  up integer;
  down integer;
  top smallint := (select max(tier) from public.league_tiers);
begin
  for g in
    select id, tier from public.league_groups
    where not settled and week_key < cur
    order by id
    for update skip locked
  loop
    select count(*) into n from public.league_members where group_id = g.id;
    rules := public.league_rules(g.tier, n);
    up := coalesce((rules ->> 'up')::integer, 0);
    down := coalesce((rules ->> 'down')::integer, 0);
    with ranked as (
      select user_id, xp, row_number() over (order by xp desc, joined_at) as rn
      from public.league_members where group_id = g.id
    )
    update public.league_members m
      set rank = r.rn,
          result = case
            when r.rn <= up and r.xp > 0 and g.tier < top then 1
            when r.rn > n - down and g.tier > 0 then -1
            else 0
          end,
          reward = case when r.xp > 0 then coalesce((
            select (x ->> 'nectar')::integer from jsonb_array_elements(rules -> 'rewards') x
            where (x ->> 'rank')::integer = r.rn limit 1), 0) else 0 end
      from ranked r
      where m.group_id = g.id and m.user_id = r.user_id;
    update public.league_status s
      set tier = least(top, greatest(0, s.tier + m.result)), updated_at = now()
      from public.league_members m
      where m.group_id = g.id and m.user_id = s.user_id and m.result <> 0;
    update public.league_groups set settled = true where id = g.id;
  end loop;
end;
$$;
revoke all on function public.league_settle_due(date) from public, anon, authenticated;

-- เข้ากลุ่มของสัปดาห์นี้: ขนาดกลุ่มสูงสุดตามระดับ
create or replace function public.league_join(p_user uuid) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  cur date := (date_trunc('week', now() at time zone 'Asia/Bangkok'))::date;
  my_tier smallint;
  cap integer;
  gid bigint;
begin
  perform public.league_settle_due(cur);
  insert into public.league_status (user_id) values (p_user) on conflict (user_id) do nothing;
  select tier into my_tier from public.league_status where user_id = p_user;
  select group_id into gid from public.league_members where user_id = p_user and week_key = cur;
  if gid is null then
    select coalesce((select max_size from public.league_tiers where tier = my_tier), 100) into cap;
    select g.id into gid
      from public.league_groups g
      where g.week_key = cur and g.tier = my_tier and not g.settled
        and (select count(*) from public.league_members m where m.group_id = g.id) < cap
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

-- ตารางลีกของผู้เล่น (ไม่รับ XP จากแอป · p_xp เก็บไว้ให้แอปรุ่นเก่าเรียกได้)
-- คืนค่า: { week, ends_at, tier, tiers: [{ tier, name, icon, color, ink }], rules: { up, down, rewards, max },
--          members: [{ name, avatar, xp, me, reaction, active }], result: { week, rank, n, from, to, reward } | null }
create or replace function public.league_sync(p_week date, p_xp integer)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  cur date := (date_trunc('week', now() at time zone 'Asia/Bangkok'))::date;
  my_tier smallint;
  gid bigint;
  n integer;
  top smallint := (select max(tier) from public.league_tiers);
  l_week date;
  l_rank integer;
  l_result smallint;
  l_from smallint;
  l_n integer;
  l_reward integer;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  gid := public.league_join(uid);
  select tier into my_tier from public.league_status where user_id = uid;
  select count(*) into n from public.league_members where group_id = gid;
  -- ผลของสัปดาห์ล่าสุดที่ตัดสินแล้ว
  select m.week_key, m.rank, m.result, g.tier, (select count(*) from public.league_members x where x.group_id = g.id), m.reward
    into l_week, l_rank, l_result, l_from, l_n, l_reward
    from public.league_members m
    join public.league_groups g on g.id = m.group_id
    where m.user_id = uid and m.week_key < cur and g.settled
    order by m.week_key desc
    limit 1;
  return jsonb_build_object(
    'week', cur,
    'ends_at', ((cur + 7)::timestamp at time zone 'Asia/Bangkok'),
    'tier', my_tier,
    'tiers', (select jsonb_agg(jsonb_build_object('tier', t.tier, 'name', t.name, 'icon', t.icon, 'color', t.color, 'ink', t.ink) order by t.tier)
              from public.league_tiers t),
    'rules', public.league_rules(my_tier, n),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('name', p.display_name, 'avatar', p.avatar, 'xp', m.xp, 'me', m.user_id = uid,
                         'reaction', s.reaction, 'active', m.xp > 0 and m.updated_at > now() - interval '15 minutes')
                       order by m.xp desc, m.joined_at)
      from public.league_members m
      join public.profiles p on p.id = m.user_id
      left join public.league_status s on s.user_id = m.user_id
      where m.group_id = gid
    ), '[]'::jsonb),
    'result', case when l_week is null then null else jsonb_build_object(
      'week', l_week, 'rank', l_rank, 'n', l_n, 'from', l_from,
      'to', least(top, greatest(0, l_from + l_result)), 'reward', coalesce(l_reward, 0)) end
  );
end;
$$;
revoke all on function public.league_sync(date, integer) from public, anon;
grant execute on function public.league_sync(date, integer) to authenticated;

-- ตั้งรีแอ็กชันของตัวเอง (null = ไม่ใช้)
create or replace function public.league_react(p_reaction text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  insert into public.league_status (user_id) values (uid) on conflict (user_id) do nothing;
  update public.league_status set reaction = nullif(p_reaction, '') where user_id = uid;
end;
$$;
revoke all on function public.league_react(text) from public, anon;
grant execute on function public.league_react(text) to authenticated;
