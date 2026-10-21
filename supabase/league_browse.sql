-- BeeMath — ดูรายชื่อผู้เล่นในแต่ละลีก (แตะลีกบนแถบลีกในหน้าอันดับ)
-- รันหลัง friends.sql และ league_v3.sql · รันซ้ำได้
-- แสดงเท่าที่คนในกลุ่มลีกเดียวกันเห็นกันอยู่แล้ว: ชื่อที่แสดง สีอวตาร XP สัปดาห์นี้
-- ผู้ใช้ปิดได้ (ตั้งค่า › "แสดงชื่อในรายชื่อลีก") → คนอื่นเห็นแค่จำนวน ยกเว้นเพื่อนที่ตกลงเป็นเพื่อนกัน

alter table public.profiles add column if not exists league_hidden boolean not null default false;

-- คืนค่า: { tier, total, hidden, players: [{ name, avatar, xp, me, friend }] }
-- total = ผู้เล่นที่อยู่ลีกนี้และเข้าแข่งภายใน 4 สัปดาห์ล่าสุด · hidden = คนที่ซ่อนชื่อ (นับใน total แต่ไม่อยู่ใน players)
-- players เรียง: ตัวเอง/เพื่อนก่อน แล้วตาม XP สัปดาห์นี้ · หน้าละ 50 คน (p_offset)
create or replace function public.league_tier_players(p_tier smallint, p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  cur date := (date_trunc('week', now() at time zone 'Asia/Bangkok'))::date;
begin
  if uid is null then raise exception 'not signed in'; end if;
  return (
    with active as (
      select s.user_id, p.display_name, p.avatar, p.league_hidden,
        coalesce((select m.xp from public.league_members m where m.user_id = s.user_id and m.week_key = cur), 0) as xp,
        s.user_id = uid as me,
        public.are_friends(uid, s.user_id) as friend
      from public.league_status s
      join public.profiles p on p.id = s.user_id
      where s.tier = p_tier
        and exists (select 1 from public.league_members m where m.user_id = s.user_id and m.week_key >= cur - 21)
    ), visible as (
      select * from active where not league_hidden or me or friend
    )
    select jsonb_build_object(
      'tier', p_tier,
      'total', (select count(*) from active),
      'hidden', (select count(*) from active) - (select count(*) from visible),
      'players', coalesce((
        select jsonb_agg(jsonb_build_object('name', v.display_name, 'avatar', v.avatar, 'xp', v.xp, 'me', v.me, 'friend', v.friend)
                         order by (v.me or v.friend) desc, v.xp desc, v.display_name)
        from (select * from visible order by (me or friend) desc, xp desc, display_name limit 50 offset greatest(0, coalesce(p_offset, 0))) v
      ), '[]'::jsonb)
    )
  );
end;
$$;
revoke all on function public.league_tier_players(smallint, integer) from public, anon;
grant execute on function public.league_tier_players(smallint, integer) to authenticated;
