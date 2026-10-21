-- BeeMath — ลีกของนักเรียนในห้อง สำหรับครู (แท็บ "ลีก" ในแดชบอร์ดครู และ "นักเรียนในห้อง" บนหน้าอันดับ)
-- รันหลัง classroom.sql และ league_v3.sql · รันซ้ำได้
-- ไม่เก็บข้อมูลใหม่: อ่านจาก league_status / league_members / league_groups ที่มีอยู่แล้ว

-- คืนค่า: { week, tiers: [{ tier, name, icon, color, ink }],
--          students: [{ id, name, avatar, tier, weeks: [{ week, tier, rank, n, xp, result, settled }] }] }
-- weeks = 8 สัปดาห์ล่าสุดที่นักเรียนเข้าแข่ง (รวมสัปดาห์นี้) · สัปดาห์ที่ไม่ได้แข่งจะไม่มีในรายการ
-- rank ของสัปดาห์ที่ยังไม่จบ = อันดับตาม XP ตอนนี้ในกลุ่ม
create or replace function public.class_league(p_class bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  cur date := (date_trunc('week', now() at time zone 'Asia/Bangkok'))::date;
begin
  if not public.is_class_owner(p_class) then raise exception 'not class owner'; end if;
  -- ตัดสินกลุ่มของสัปดาห์ที่จบแล้ว (ปกติเกิดเมื่อมีคนเปิดลีกครั้งแรกของสัปดาห์) ให้ลีกตอนนี้ของนักเรียนเป็นปัจจุบัน
  perform public.league_settle_due(cur);
  return jsonb_build_object(
    'week', cur,
    'tiers', (select jsonb_agg(jsonb_build_object('tier', t.tier, 'name', t.name, 'icon', t.icon, 'color', t.color, 'ink', t.ink) order by t.tier)
              from public.league_tiers t),
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', cm.user_id, 'name', p.display_name, 'avatar', p.avatar,
        'tier', s.tier,
        'weeks', coalesce((
          select jsonb_agg(jsonb_build_object(
            'week', m.week_key, 'tier', g.tier, 'xp', m.xp, 'result', m.result, 'settled', g.settled,
            'n', (select count(*) from public.league_members x where x.group_id = g.id),
            'rank', coalesce(m.rank, (select count(*) + 1 from public.league_members x where x.group_id = g.id and x.xp > m.xp))
          ) order by m.week_key)
          from public.league_members m
          join public.league_groups g on g.id = m.group_id
          where m.user_id = cm.user_id and m.week_key >= cur - 49), '[]'::jsonb)
      ) order by p.display_name)
      from public.class_members cm
      join public.profiles p on p.id = cm.user_id
      left join public.league_status s on s.user_id = cm.user_id
      where cm.class_id = p_class), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.class_league(bigint) from public, anon;
grant execute on function public.class_league(bigint) to authenticated;
