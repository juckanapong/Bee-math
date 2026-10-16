-- =====================================================================
-- BeeMath · อัปเดตลีก (v2): กลุ่มใหญ่ขึ้น + กันโกง XP เข้มขึ้น
-- วิธีใช้: SQL Editor › New query › วางทั้งไฟล์นี้ › Run (รันซ้ำได้) · ต้องรัน league.sql มาก่อนแล้ว
--
-- เปลี่ยนอะไร
-- - กลุ่มละไม่เกิน 100 คน (เดิม 20) ผู้เล่นระดับเดียวกันในสัปดาห์เดียวกันจึงอยู่ตารางเดียวกัน
-- - รวมกลุ่มของสัปดาห์นี้ที่แยกกันอยู่ (ระดับเดียวกัน) เข้าเป็นกลุ่มเดียว
-- - XP ลีกไม่เกิน 300 ต่อวัน (เดิม 600) และเพิ่มได้ไม่เกิน 30 XP ต่อนาทีนับจากซิงก์ครั้งก่อน
-- - ปรับ XP ของสัปดาห์นี้ที่เกินเพดานใหม่ลงมาให้อยู่ในเพดาน
-- =====================================================================

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
        and (select count(*) from public.league_members m where m.group_id = g.id) < 100
      order by g.id
      limit 1;
    if gid is null then
      insert into public.league_groups (week_key, tier) values (cur, my_tier) returning id into gid;
    end if;
    insert into public.league_members (group_id, user_id, week_key)
      values (gid, uid, cur) on conflict (user_id, week_key) do nothing;
    select group_id into gid from public.league_members where user_id = uid and week_key = cur;
  end if;

  -- บันทึก XP (เฉพาะสัปดาห์ปัจจุบัน) พร้อมกันโกง 3 ชั้น:
  -- 1) ไม่เกิน 300 XP ต่อวันที่ผ่านไปในสัปดาห์  2) เพิ่มได้ไม่เกิน 30 XP ต่อนาทีนับจากซิงก์ครั้งก่อน (ขั้นต่ำ 60)  3) ไม่ลดลง
  if p_week = cur and p_xp is not null and p_xp > 0 then
    cap := 300 * (((now() at time zone 'Asia/Bangkok')::date - cur) + 1);
    update public.league_members
      set xp = greatest(xp, least(p_xp, cap,
                 xp + greatest(60, floor(30 * extract(epoch from (now() - updated_at)) / 60)::integer))),
          updated_at = case when least(p_xp, cap) > xp then now() else updated_at end
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

-- รวมกลุ่มของสัปดาห์นี้: ย้ายสมาชิกจากกลุ่มที่ยังไม่ตัดสินทุกกลุ่ม ไปไว้ในกลุ่มแรกของระดับเดียวกัน แล้วลบกลุ่มที่ว่าง
do $$
declare
  cur date := (date_trunc('week', now() at time zone 'Asia/Bangkok'))::date;
  t record;
  keep_id bigint;
begin
  for t in select distinct tier from public.league_groups where week_key = cur and not settled loop
    select min(id) into keep_id from public.league_groups where week_key = cur and tier = t.tier and not settled;
    update public.league_members m set group_id = keep_id
      from public.league_groups g
      where m.group_id = g.id and g.week_key = cur and g.tier = t.tier and not g.settled and g.id <> keep_id;
    delete from public.league_groups g
      where g.week_key = cur and g.tier = t.tier and not g.settled and g.id <> keep_id
        and not exists (select 1 from public.league_members m where m.group_id = g.id);
  end loop;

  -- XP ของสัปดาห์นี้ที่เกินเพดานใหม่ (300 ต่อวันที่ผ่านไป)
  update public.league_members
    set xp = 300 * (((now() at time zone 'Asia/Bangkok')::date - cur) + 1)
    where week_key = cur and xp > 300 * (((now() at time zone 'Asia/Bangkok')::date - cur) + 1);
end;
$$;

revoke all on function public.league_sync(date, integer) from public, anon;
grant execute on function public.league_sync(date, integer) to authenticated;
