-- =====================================================================
-- BeeMath · ระยะ 2d: ห้องเรียนและแดชบอร์ดครู
-- วิธีใช้: รัน schema.sql, league.sql, friends.sql ก่อน แล้ว SQL Editor › New query › วางทั้งไฟล์นี้ › Run (รันซ้ำได้)
--
-- หลักการ
-- - ผู้ใช้ที่ล็อกอินด้วยอีเมลสร้างห้องเรียนได้ (= เป็นครูของห้องนั้น) ได้รหัสเข้าห้อง เช่น HIVE-7KQ2
-- - นักเรียนเข้าห้องด้วยรหัส (บัญชีอีเมล หรือบัญชีห้องเรียนแบบไม่ใช้อีเมล = Anonymous sign-in)
-- - ครูเห็นความคืบหน้าของนักเรียนเฉพาะในห้องของตัวเอง: ชื่อ ด่านที่ผ่าน ความแม่นยำรายทักษะ สตรีค XP เวลาใช้งานล่าสุด
-- - ครูมอบหมายงาน (ชุดด่านบนเส้นทาง + วันส่ง) นักเรียนเห็นงานบนหน้าหลัก
-- - ทุกตารางเปิด RLS โดยไม่มี policy = เข้าถึงได้ผ่านฟังก์ชันด้านล่างเท่านั้น
-- =====================================================================

create table if not exists public.classes (
  id bigint generated always as identity primary key,
  owner uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  join_code text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists classes_owner on public.classes (owner);

create table if not exists public.class_members (
  class_id bigint not null references public.classes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (class_id, user_id)
);
create index if not exists class_members_user on public.class_members (user_id);

create table if not exists public.assignments (
  id bigint generated always as identity primary key,
  class_id bigint not null references public.classes (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  nodes text[] not null check (cardinality(nodes) between 1 and 30),
  due date,
  created_at timestamptz not null default now()
);
create index if not exists assignments_class on public.assignments (class_id);

alter table public.classes enable row level security;
alter table public.class_members enable row level security;
alter table public.assignments enable row level security;

-- ---------- ตัวช่วย ----------
create or replace function public.new_class_code() returns text
language plpgsql set search_path = '' as $$
declare
  alphabet text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  code text;
begin
  loop
    code := 'HIVE-';
    for i in 1..4 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
    end loop;
    exit when not exists (select 1 from public.classes where join_code = code);
  end loop;
  return code;
end;
$$;

create or replace function public.is_class_owner(c bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.classes where id = c and owner = auth.uid())
$$;

-- บัญชีห้องเรียนแบบไม่ใช้อีเมล (Anonymous) สร้างห้องเรียนไม่ได้
create or replace function public.is_anon_user() returns boolean
language sql stable set search_path = '' as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
$$;

revoke all on function public.new_class_code() from public, anon, authenticated;
revoke all on function public.is_class_owner(bigint) from public, anon, authenticated;

-- ---------- ฝั่งครู ----------
create or replace function public.class_create(p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  c public.classes%rowtype;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if public.is_anon_user() then raise exception 'anonymous users cannot create classes'; end if;
  if (select count(*) from public.classes where owner = uid) >= 20 then raise exception 'class limit reached'; end if;
  insert into public.classes (owner, name, join_code)
    values (uid, left(trim(p_name), 40), public.new_class_code())
    returning * into c;
  return jsonb_build_object('id', c.id, 'name', c.name, 'code', c.join_code);
end;
$$;

create or replace function public.class_delete(p_class bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_class_owner(p_class) then raise exception 'not class owner'; end if;
  delete from public.classes where id = p_class;
end;
$$;

create or replace function public.teacher_classes() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'name', c.name, 'code', c.join_code,
    'students', (select count(*) from public.class_members m where m.class_id = c.id)
  ) order by c.created_at), '[]'::jsonb)
  from public.classes c where c.owner = auth.uid()
$$;

-- ข้อมูลทั้งห้องสำหรับแดชบอร์ด (เฉพาะเจ้าของห้อง)
create or replace function public.class_dashboard(p_class bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  today text := (now() at time zone 'Asia/Bangkok')::date::text;
  cur date := (date_trunc('week', now() at time zone 'Asia/Bangkok'))::date;
begin
  if not public.is_class_owner(p_class) then raise exception 'not class owner'; end if;
  return jsonb_build_object(
    'class', (select jsonb_build_object('id', id, 'name', name, 'code', join_code) from public.classes where id = p_class),
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', cm.user_id, 'name', p.display_name, 'avatar', p.avatar, 'joined', cm.joined_at,
        'xp', coalesce(pr.xp, 0),
        'week_xp', coalesce((select lm.xp from public.league_members lm where lm.user_id = cm.user_id and lm.week_key = cur), 0),
        'streak', case when (pr.state ->> 'lastDay')::date >= (now() at time zone 'Asia/Bangkok')::date - 1 then coalesce(pr.streak, 0) else 0 end,
        'today', coalesce(pr.state -> 'days' ->> today = 'learn', false),
        'last_active', pr.updated_at,
        'done', coalesce((select jsonb_agg(k) from jsonb_object_keys(coalesce(pr.state -> 'done', '{}'::jsonb)) as k), '[]'::jsonb),
        'answered', coalesce((pr.state -> 'stats' ->> 'answered')::integer, 0),
        'correct', coalesce((pr.state -> 'stats' ->> 'correct')::integer, 0),
        'skills', coalesce((
          select jsonb_object_agg(e.k, jsonb_build_array(
            (select coalesce(sum(x::integer), 0) from jsonb_array_elements_text(coalesce(e.v -> 'r', '[]'::jsonb)) as x),
            jsonb_array_length(coalesce(e.v -> 'r', '[]'::jsonb))))
          from jsonb_each(coalesce(pr.state -> 'skills', '{}'::jsonb)) as e(k, v)), '{}'::jsonb)
      ) order by p.display_name)
      from public.class_members cm
      join public.profiles p on p.id = cm.user_id
      left join public.progress pr on pr.user_id = cm.user_id
      where cm.class_id = p_class), '[]'::jsonb),
    'assignments', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'nodes', to_jsonb(a.nodes), 'due', a.due) order by a.due nulls last, a.id)
      from public.assignments a where a.class_id = p_class), '[]'::jsonb)
  );
end;
$$;

create or replace function public.assignment_create(p_class bigint, p_title text, p_nodes text[], p_due date) returns bigint
language plpgsql security definer set search_path = '' as $$
declare new_id bigint;
begin
  if not public.is_class_owner(p_class) then raise exception 'not class owner'; end if;
  if (select count(*) from public.assignments where class_id = p_class) >= 50 then raise exception 'assignment limit reached'; end if;
  insert into public.assignments (class_id, title, nodes, due)
    values (p_class, left(trim(p_title), 60), p_nodes, p_due) returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.assignment_delete(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_class_owner((select class_id from public.assignments where id = p_id)) then raise exception 'not class owner'; end if;
  delete from public.assignments where id = p_id;
end;
$$;

create or replace function public.class_remove_student(p_class bigint, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_class_owner(p_class) then raise exception 'not class owner'; end if;
  delete from public.class_members where class_id = p_class and user_id = p_user;
end;
$$;

-- ---------- ฝั่งนักเรียน ----------
-- คืนค่า: { status: joined · already · not_found · own · limit, name }
create or replace function public.class_join(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  c public.classes%rowtype;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into c from public.classes where join_code = upper(trim(p_code));
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if c.owner = uid then return jsonb_build_object('status', 'own', 'name', c.name); end if;
  if exists (select 1 from public.class_members where class_id = c.id and user_id = uid) then
    return jsonb_build_object('status', 'already', 'name', c.name);
  end if;
  if (select count(*) from public.class_members where user_id = uid) >= 10 then
    return jsonb_build_object('status', 'limit');
  end if;
  insert into public.class_members (class_id, user_id) values (c.id, uid);
  return jsonb_build_object('status', 'joined', 'name', c.name);
end;
$$;

create or replace function public.class_leave(p_class bigint) returns void
language sql security definer set search_path = '' as $$
  delete from public.class_members where class_id = p_class and user_id = auth.uid()
$$;

-- ห้องเรียนที่ฉันเป็นนักเรียน พร้อมงานที่ได้รับมอบหมาย
create or replace function public.my_classes() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'name', c.name,
    'teacher', (select display_name from public.profiles where id = c.owner),
    'assignments', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'nodes', to_jsonb(a.nodes), 'due', a.due) order by a.due nulls last, a.id)
      from public.assignments a where a.class_id = c.id), '[]'::jsonb)
  ) order by m.joined_at), '[]'::jsonb)
  from public.class_members m join public.classes c on c.id = m.class_id
  where m.user_id = auth.uid()
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'class_create(text)', 'class_delete(bigint)', 'teacher_classes()', 'class_dashboard(bigint)',
    'assignment_create(bigint, text, text[], date)', 'assignment_delete(bigint)', 'class_remove_student(bigint, uuid)',
    'class_join(text)', 'class_leave(bigint)', 'my_classes()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end;
$$;
