-- =====================================================================
-- BeeMath · ระยะ 2a: บัญชีผู้ใช้ + ซิงก์ความคืบหน้า
-- วิธีใช้: Supabase Dashboard › SQL Editor › New query › วางทั้งไฟล์ › Run
-- รันซ้ำได้อย่างปลอดภัย (ใช้ if not exists / drop ... if exists)
-- ความปลอดภัย: ทุกตารางเปิด Row Level Security ผู้ใช้อ่าน/เขียนได้เฉพาะแถวของตัวเอง
-- =====================================================================

-- ข้อมูลที่แสดงต่อผู้อื่นในอนาคต (ลีก เพื่อน): ชื่อและสีอวตาร
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'ผู้เรียน' check (char_length(display_name) between 1 and 20),
  avatar text not null default '#FFF0C2' check (avatar ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now()
);

-- ความคืบหน้าทั้งหมดของแอป (state = ข้อมูลเดียวกับที่เก็บใน localStorage)
-- คอลัมน์ xp/week_xp/streak/league_tier แยกออกมาเพื่อใช้ทำลีกจริงในระยะ 2b
create table if not exists public.progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null,
  xp integer not null default 0 check (xp >= 0),
  week_key date,
  week_xp integer not null default 0 check (week_xp >= 0),
  streak integer not null default 0 check (streak >= 0),
  league_tier smallint not null default 0 check (league_tier between 0 and 4),
  updated_at timestamptz not null default now(),
  constraint state_size check (pg_column_size(state) < 200000)
);

alter table public.profiles enable row level security;
alter table public.progress enable row level security;

drop policy if exists "profiles: read own" on public.profiles;
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: read own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles: update own" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists "progress: read own" on public.progress;
drop policy if exists "progress: insert own" on public.progress;
drop policy if exists "progress: update own" on public.progress;
create policy "progress: read own" on public.progress
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "progress: insert own" on public.progress
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "progress: update own" on public.progress
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- สร้างโปรไฟล์อัตโนมัติเมื่อมีผู้สมัครใหม่ (ใช้ชื่อที่กรอกตอนสมัคร)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(left(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 20), 'ผู้เรียน'))
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ลบบัญชีของตัวเอง (สิทธิ์ตาม PDPA) ข้อมูลใน profiles/progress ถูกลบตามด้วย on delete cascade
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
