-- =====================================================================
-- BeeMath · แจ้งปัญหา / ข้อเสนอแนะ / รายงานโจทย์
-- วิธีใช้: SQL Editor › New query › วางทั้งไฟล์นี้ › Run (รันซ้ำได้)
--
-- หลักการ
-- - ผู้ใช้ที่เข้าสู่ระบบส่งข้อความได้ผ่าน feedback_send() เท่านั้น (วันละไม่เกิน 10 ข้อความ)
-- - ไม่มีผู้ใช้คนไหนอ่านข้อความของคนอื่นได้ ผู้ดูแลอ่านใน Table Editor › feedback (หรือ view feedback_inbox)
-- - ลบบัญชีแล้วข้อความของบัญชีนั้นถูกลบด้วย (on delete cascade) ตามนโยบายความเป็นส่วนตัว
-- =====================================================================

create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('bug', 'question', 'idea', 'other')),
  message text not null check (char_length(message) between 1 and 1000),
  context jsonb not null default '{}'::jsonb check (octet_length(context::text) <= 4000),
  status text not null default 'new' check (status in ('new', 'seen', 'done')),
  created_at timestamptz not null default now()
);
create index if not exists feedback_user_day on public.feedback (user_id, created_at);
create index if not exists feedback_new on public.feedback (status, created_at desc);

alter table public.feedback enable row level security;

create or replace function public.feedback_send(p_kind text, p_message text, p_context jsonb) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  new_id bigint;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if (select count(*) from public.feedback where user_id = uid and created_at > now() - interval '1 day') >= 10 then
    raise exception 'feedback limit reached';
  end if;
  insert into public.feedback (user_id, kind, message, context)
    values (uid, p_kind, left(trim(p_message), 1000), coalesce(p_context, '{}'::jsonb))
    returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.feedback_send(text, text, jsonb) from public, anon;
grant execute on function public.feedback_send(text, text, jsonb) to authenticated;

-- สำหรับผู้ดูแลอ่านใน SQL Editor: select * from public.feedback_inbox;
-- (ไม่เปิดให้ผู้ใช้ทั่วไป: ถอนสิทธิ์จาก anon และ authenticated)
create or replace view public.feedback_inbox with (security_invoker = true) as
  select f.id, f.created_at, f.status, f.kind, f.message, p.display_name,
         f.context ->> 'view' as view, f.context -> 'question' as question, f.context ->> 'device' as device
  from public.feedback f left join public.profiles p on p.id = f.user_id
  order by f.created_at desc;
revoke all on public.feedback_inbox from public, anon, authenticated;
