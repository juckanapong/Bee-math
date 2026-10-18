-- =====================================================================
-- BeeMath · ระยะ 7: ระบบหลังบ้าน · ตั้งค่าจากเซิร์ฟเวอร์ (feature flags · สวิตช์ฉุกเฉิน · ประกาศ) · เก็บ error
-- วิธีใช้: SQL Editor › New query › วางทั้งไฟล์นี้ › Run (รันซ้ำได้)
--
-- app_config (ทุกคนอ่านได้ รวมผู้ที่ไม่มีบัญชี · แก้ได้เฉพาะผู้ดูแลใน Table Editor / SQL Editor)
--   flags  { push, feed, reactions }      ปิดฟีเจอร์ได้ทันทีโดยไม่ต้องปล่อยแอปใหม่ (false = ปิด)
--   kill   { offline, message }            สวิตช์ฉุกเฉิน: แอปหยุดเรียกเซิร์ฟเวอร์ทั้งหมด เรียนต่อในเครื่องได้ ซิงก์เมื่อปิดสวิตช์
--   notice { text, until }                 แถบประกาศบนหน้าหลัก (until = วันเวลาที่หยุดแสดง หรือ null)
-- แอปอ่านค่าตอนเปิดและทุก 10 นาที แล้วจำไว้ในเครื่อง (ใช้ได้แม้ออฟไลน์ครั้งถัดไป)
--
-- client_errors: error ของ JavaScript ในเครื่องผู้ใช้ รวมตามลายเซ็น (ข้อความ + ตำแหน่งแรก) และนับต่อวัน
--   ไม่เก็บตัวตน อีเมล หรือข้อมูลการเรียน · เก็บ 30 วัน · จำกัด 300 ลายเซ็นต่อวัน
-- =====================================================================

create table if not exists public.app_config (
  key text primary key check (key ~ '^[a-z_]{1,30}$'),
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_config enable row level security;
drop policy if exists "app_config: everyone reads" on public.app_config;
create policy "app_config: everyone reads" on public.app_config for select to anon, authenticated using (true);
-- ค่าเริ่มต้น (ไม่ทับค่าที่แก้ไว้แล้วเมื่อรันซ้ำ)
insert into public.app_config (key, value) values
  ('flags', '{"push": true, "feed": true, "reactions": true}'),
  ('kill', '{"offline": false, "message": ""}'),
  ('notice', '{"text": "", "until": null}')
on conflict (key) do nothing;

create table if not exists public.client_errors (
  day date not null default (now() at time zone 'Asia/Bangkok')::date,
  sig text not null,                        -- ลายเซ็น: แฮชของข้อความ + ตำแหน่งแรก
  message text not null,
  source text,                              -- ไฟล์:บรรทัด:คอลัมน์
  stack text,
  version text,                             -- รุ่นแอป (APP_VERSION ใน js/ops.js)
  view text,                                -- หน้าที่เปิดอยู่ เช่น lesson · board
  browser text,                             -- ชื่อเบราว์เซอร์และระบบปฏิบัติการแบบย่อ
  count integer not null default 1,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  primary key (day, sig)
);
alter table public.client_errors enable row level security;

-- รายงาน error (เรียกได้ทั้งผู้มีบัญชีและไม่มีบัญชี) · ตัดความยาว · นับซ้ำแทนการเพิ่มแถว · ลบของเก่ากว่า 30 วัน
create or replace function public.report_error(p_sig text, p_message text, p_source text, p_stack text, p_version text, p_view text, p_browser text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Asia/Bangkok')::date;
begin
  if p_sig is null or p_sig !~ '^[a-z0-9]{1,40}$' or coalesce(p_message, '') = '' then return; end if;
  if not exists (select 1 from public.client_errors where day = today and sig = p_sig)
     and (select count(*) from public.client_errors where day = today) >= 300 then
    return; -- กันการส่งรัว: วันละไม่เกิน 300 ลายเซ็น
  end if;
  insert into public.client_errors as e (day, sig, message, source, stack, version, view, browser)
    values (today, p_sig, left(p_message, 500), left(p_source, 200), left(p_stack, 2000), left(p_version, 20), left(p_view, 30), left(p_browser, 60))
    on conflict (day, sig) do update set count = least(e.count + 1, 1000000), last_at = now(),
      version = excluded.version, view = excluded.view, browser = excluded.browser;
  delete from public.client_errors where day < today - 30;
end;
$$;
revoke all on function public.report_error(text, text, text, text, text, text, text) from public;
grant execute on function public.report_error(text, text, text, text, text, text, text) to anon, authenticated;

-- สรุป error สำหรับผู้ดูแล (SQL Editor): select * from public.client_errors_summary;
create or replace view public.client_errors_summary with (security_invoker = true) as
  select message, source, sum(count) as total, count(distinct day) as days, max(last_at) as last_seen,
         (array_agg(version order by last_at desc))[1] as latest_version, (array_agg(view order by last_at desc))[1] as latest_view
  from public.client_errors
  where day > (now() at time zone 'Asia/Bangkok')::date - 7
  group by message, source
  order by total desc;
revoke all on public.client_errors_summary from anon, authenticated;
