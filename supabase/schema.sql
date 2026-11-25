-- =====================================================================
--  السلطان للتوزيع - نظام مديونيات المناديب
--  Supabase / Postgres schema. Run once in: Supabase > SQL Editor.
--
--  Principles:
--   * Money records (transactions) are append-only. Nobody can DELETE,
--     and the only UPDATE allowed is an admin approving/rejecting a
--     pending correction. History is permanent (audit / disputes).
--   * A rep sees and writes only his own customers and records (RLS).
--   * New credit (invoice) is refused in the database when it would
--     push the rep above his credit limit.
--   * Reps cannot backdate records (time is set by the server).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Profiles (one per login)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete restrict,
  username      text not null unique,
  full_name     text not null,
  role          text not null default 'rep' check (role in ('rep','admin')),
  credit_limit  numeric(14,2) not null default 0 check (credit_limit >= 0),
  active        boolean not null default false,
  created_at    timestamptz not null default now()
);
-- Agencies / brands (توكيلات), e.g. Tiger, Molfix. Admin adds them; each rep belongs to one.
create table if not exists public.agencies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (length(trim(name)) > 0),
  created_at  timestamptz not null default now()
);
alter table public.profiles add column if not exists agency_id uuid references public.agencies(id);

-- Each rep sells either retail (قطاعي) or wholesale (جملة) only; chosen at sign-up.
alter table public.profiles add column if not exists rep_type text
  check (rep_type in ('retail','wholesale'));

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and active);
$$;

-- Two kinds of admin:
--   head admin (Sayed, Mohamed): agency_id is null -> every agency.
--   agency manager: agency_id set -> only that agency's reps, customers and ledger.
create or replace function public.admin_agency() returns uuid
language sql stable security definer set search_path = public as $$
  select agency_id from public.profiles where id = auth.uid() and role = 'admin' and active;
$$;

create or replace function public.is_head_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and active and agency_id is null);
$$;

-- Can the current admin see / manage this rep (and the rep's customers and ledger)?
create or replace function public.can_manage_rep(rid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_head_admin() or exists (
    select 1 from public.profiles r
    where r.id = rid and r.role = 'rep' and r.agency_id is not null and r.agency_id = public.admin_agency());
$$;

-- New sign-up -> inactive rep profile (admin activates + sets limit)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, full_name, rep_type, agency_id)
  values (
    new.id,
    lower(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))),
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1)),
    case when new.raw_user_meta_data->>'rep_type' in ('retail','wholesale') then new.raw_user_meta_data->>'rep_type' end,
    (select a.id from public.agencies a where a.id::text = new.raw_user_meta_data->>'agency_id')
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Only admins may change role / limit / active; keep an audit trail.
create table if not exists public.audit_log (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  actor       uuid default auth.uid(),
  entity      text not null,
  entity_id   text not null,
  action      text not null,
  details     jsonb
);

create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.id <> old.id or new.username <> old.username then
    raise exception 'لا يمكن تغيير اسم المستخدم';
  end if;
  -- auth.uid() is null only for the SQL editor / service role (owner setup)
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'التعديل مسموح للإدارة فقط';
  end if;
  -- agency managers: only their own agency's reps, no role changes, no moving reps to another agency
  if auth.uid() is not null and not public.is_head_admin() then
    if not public.can_manage_rep(old.id) then raise exception 'الحساب ده مش في توكيلك'; end if;
    if new.role <> old.role then raise exception 'تغيير الصلاحية للمدير العام بس'; end if;
    if new.agency_id is distinct from public.admin_agency() then raise exception 'مينفعش تنقل مندوب لتوكيل تاني'; end if;
  end if;
  insert into public.audit_log (entity, entity_id, action, details)
  values ('profile', old.id::text, 'update', jsonb_build_object(
    'before', jsonb_build_object('role', old.role, 'credit_limit', old.credit_limit, 'active', old.active, 'full_name', old.full_name, 'rep_type', old.rep_type, 'agency_id', old.agency_id),
    'after',  jsonb_build_object('role', new.role, 'credit_limit', new.credit_limit, 'active', new.active, 'full_name', new.full_name, 'rep_type', new.rep_type, 'agency_id', new.agency_id)));
  return new;
end $$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------------------------------------------------------------------
-- Customers (shops / kiosks). Traders have no login.
-- ---------------------------------------------------------------------
create table if not exists public.customers (
  id          uuid primary key default gen_random_uuid(),
  rep_id      uuid not null references public.profiles(id),
  name        text not null check (length(trim(name)) > 0),
  phone       text,
  location    text,
  debt_type   text not null default 'retail' check (debt_type in ('retail','wholesale')),
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid() references public.profiles(id)
);
create index if not exists customers_rep_idx on public.customers(rep_id);
alter table public.customers add column if not exists agency_id uuid references public.agencies(id);

create or replace function public.guard_customer_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare me public.profiles;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null or not me.active then raise exception 'الحساب غير مفعل'; end if;
  if me.role <> 'admin' then
    new.rep_id := me.id;
  elsif not public.can_manage_rep(new.rep_id) then
    raise exception 'المندوب ده مش في توكيلك';
  end if;
  -- the customer's type always follows the rep who owns it
  new.debt_type := coalesce((select rep_type from public.profiles where id = new.rep_id), 'retail');
  new.agency_id := (select agency_id from public.profiles where id = new.rep_id);
  new.created_by := me.id;
  new.created_at := now();
  return new;
end $$;

drop trigger if exists customers_guard_ins on public.customers;
create trigger customers_guard_ins before insert on public.customers
  for each row execute function public.guard_customer_insert();

create or replace function public.guard_customer_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'تعديل بيانات العميل للإدارة فقط'; end if;
  if not public.can_manage_rep(old.rep_id) or not public.can_manage_rep(new.rep_id) then
    raise exception 'العميل ده مش في توكيلك';
  end if;
  new.debt_type := coalesce((select rep_type from public.profiles where id = new.rep_id), old.debt_type);
  new.agency_id := (select agency_id from public.profiles where id = new.rep_id);
  insert into public.audit_log (entity, entity_id, action, details)
  values ('customer', old.id::text, 'update', jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new)));
  return new;
end $$;

drop trigger if exists customers_guard_upd on public.customers;
create trigger customers_guard_upd before update on public.customers
  for each row execute function public.guard_customer_update();

-- ---------------------------------------------------------------------
-- Transactions (append-only ledger)
--   opening    : opening balance when the customer is first added  (+)
--   invoice    : new sale on credit, due after 15 days              (+)
--   collection : money collected from the customer                  (-)
--   correction : signed amount; from a rep it waits for admin approval
-- ---------------------------------------------------------------------
create table if not exists public.transactions (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.customers(id),
  rep_id       uuid not null references public.profiles(id),
  kind         text not null check (kind in ('opening','invoice','collection','correction')),
  amount       numeric(14,2) not null check (amount <> 0),
  note         text,
  status       text not null default 'approved' check (status in ('approved','pending','rejected')),
  corrects_id  uuid references public.transactions(id),
  occurred_at  timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  created_by   uuid default auth.uid() references public.profiles(id),
  reviewed_by  uuid references public.profiles(id),
  reviewed_at  timestamptz,
  constraint positive_unless_correction check (kind = 'correction' or amount > 0)
);
create index if not exists tx_customer_idx on public.transactions(customer_id, occurred_at);
create index if not exists tx_rep_idx on public.transactions(rep_id, occurred_at);

create or replace function public.customer_balance(cid uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(case when kind = 'collection' then -amount else amount end), 0)
  from public.transactions where customer_id = cid and status = 'approved';
$$;

create or replace function public.rep_balance(rid uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(case when kind = 'collection' then -amount else amount end), 0)
  from public.transactions where rep_id = rid and status = 'approved';
$$;

create or replace function public.guard_tx_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  me   public.profiles;
  cust public.customers;
  rep  public.profiles;
  bal  numeric;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null or not me.active then raise exception 'الحساب غير مفعل'; end if;

  select * into cust from public.customers where id = new.customer_id;
  if cust.id is null then raise exception 'العميل غير موجود'; end if;
  if me.role <> 'admin' and cust.rep_id <> me.id then raise exception 'العميل ده مش بتاعك'; end if;
  if me.role = 'admin' and not public.can_manage_rep(cust.rep_id) then raise exception 'العميل ده مش في توكيلك'; end if;

  new.rep_id     := cust.rep_id;
  new.created_by := me.id;
  new.created_at := now();
  new.reviewed_by := null;
  new.reviewed_at := null;

  if me.role <> 'admin' then
    -- reps cannot backdate, except the opening balance date (max 1 year back)
    if new.kind = 'opening' then
      new.occurred_at := least(greatest(coalesce(new.occurred_at, now()), now() - interval '365 days'), now());
    else
      new.occurred_at := now();
    end if;
    new.status := case when new.kind = 'correction' then 'pending' else 'approved' end;
  else
    new.status := 'approved';
    new.reviewed_by := case when new.kind = 'correction' then me.id end;
    new.reviewed_at := case when new.kind = 'correction' then now() end;
  end if;

  if new.kind = 'opening' and exists (select 1 from public.transactions where customer_id = new.customer_id and kind = 'opening') then
    raise exception 'الرصيد الافتتاحي متسجل قبل كده';
  end if;

  if new.kind = 'collection' then
    bal := public.customer_balance(new.customer_id);
    if new.amount > bal then
      raise exception 'المبلغ (%) أكبر من مديونية العميل (%)', new.amount, bal;
    end if;
  end if;

  if new.kind = 'invoice' then
    select * into rep from public.profiles where id = cust.rep_id;
    bal := public.rep_balance(cust.rep_id);
    if bal + new.amount > rep.credit_limit then
      raise exception 'مرفوض: المديونية هتبقى % وحد الائتمان %', bal + new.amount, rep.credit_limit;
    end if;
  end if;

  return new;
end $$;

drop trigger if exists tx_guard_ins on public.transactions;
create trigger tx_guard_ins before insert on public.transactions
  for each row execute function public.guard_tx_insert();

-- Only change allowed: admin reviews a pending correction.
create or replace function public.guard_tx_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() or not public.can_manage_rep(old.rep_id) then raise exception 'السجلات لا تعدل'; end if;
  if old.status <> 'pending' or new.status not in ('approved','rejected') then
    raise exception 'المسموح فقط مراجعة طلب تصحيح معلق';
  end if;
  if (new.customer_id, new.rep_id, new.kind, new.amount, coalesce(new.note,''), new.occurred_at, new.created_at, new.created_by)
     is distinct from
     (old.customer_id, old.rep_id, old.kind, old.amount, coalesce(old.note,''), old.occurred_at, old.created_at, old.created_by) then
    raise exception 'السجلات لا تعدل';
  end if;
  new.reviewed_by := auth.uid();
  new.reviewed_at := now();
  return new;
end $$;

drop trigger if exists tx_guard_upd on public.transactions;
create trigger tx_guard_upd before update on public.transactions
  for each row execute function public.guard_tx_update();

create or replace function public.block_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'الحذف ممنوع: السجلات محفوظة للأرشيف';
end $$;

drop trigger if exists tx_no_delete on public.transactions;
create trigger tx_no_delete before delete on public.transactions for each row execute function public.block_delete();
drop trigger if exists customers_no_delete on public.customers;
create trigger customers_no_delete before delete on public.customers for each row execute function public.block_delete();
drop trigger if exists agencies_no_delete on public.agencies;
create trigger agencies_no_delete before delete on public.agencies for each row execute function public.block_delete();
drop trigger if exists profiles_no_delete on public.profiles;
create trigger profiles_no_delete before delete on public.profiles for each row execute function public.block_delete();

-- Add customer + opening balance in one call (p_debt_type is ignored: the type follows the rep)
create or replace function public.add_customer(
  p_name text, p_phone text, p_location text, p_debt_type text,
  p_opening numeric, p_opening_date timestamptz, p_rep_id uuid default null
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare cid uuid;
begin
  insert into public.customers (rep_id, name, phone, location, debt_type)
  values (coalesce(p_rep_id, auth.uid()), trim(p_name), nullif(trim(p_phone),''), nullif(trim(p_location),''), p_debt_type)
  returning id into cid;
  if coalesce(p_opening, 0) > 0 then
    insert into public.transactions (customer_id, rep_id, kind, amount, note, occurred_at)
    values (cid, coalesce(p_rep_id, auth.uid()), 'opening', p_opening, 'رصيد افتتاحي', coalesce(p_opening_date, now()));
  end if;
  return cid;
end $$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles     enable row level security;
alter table public.customers    enable row level security;
alter table public.transactions enable row level security;
alter table public.audit_log    enable row level security;
alter table public.agencies     enable row level security;

-- Agency names are public (the sign-up page lists them; the app hides other agencies from managers).
-- Only head admins add or rename agencies.
drop policy if exists agencies_select on public.agencies;
create policy agencies_select on public.agencies for select using (true);
drop policy if exists agencies_insert on public.agencies;
create policy agencies_insert on public.agencies for insert with check (public.is_head_admin());
drop policy if exists agencies_update on public.agencies;
create policy agencies_update on public.agencies for update using (public.is_head_admin());
grant select on public.agencies to anon;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (
  id = auth.uid() or public.can_manage_rep(id)
  or (public.is_admin() and role = 'admin' and (agency_id is null or agency_id = public.admin_agency())));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update using (public.is_admin() and public.can_manage_rep(id) or public.is_head_admin());

drop policy if exists customers_select on public.customers;
create policy customers_select on public.customers for select using (rep_id = auth.uid() or public.can_manage_rep(rep_id));
drop policy if exists customers_insert on public.customers;
create policy customers_insert on public.customers for insert with check (rep_id = auth.uid() or public.can_manage_rep(rep_id));
drop policy if exists customers_update on public.customers;
create policy customers_update on public.customers for update using (public.can_manage_rep(rep_id));

drop policy if exists tx_select on public.transactions;
create policy tx_select on public.transactions for select using (rep_id = auth.uid() or public.can_manage_rep(rep_id));
drop policy if exists tx_insert on public.transactions;
create policy tx_insert on public.transactions for insert with check (rep_id = auth.uid() or public.can_manage_rep(rep_id));
drop policy if exists tx_update on public.transactions;
create policy tx_update on public.transactions for update using (public.can_manage_rep(rep_id));

drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log for select using (public.is_head_admin());

-- ---------------------------------------------------------------------
-- Realtime (instant updates without refresh)
-- ---------------------------------------------------------------------
do $$ begin
  begin alter publication supabase_realtime add table public.transactions; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.customers;    exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.profiles;     exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.agencies;     exception when duplicate_object then null; end;
end $$;

-- ---------------------------------------------------------------------
-- After Sayed and Mohamed sign up from the site, make them admins:
--   update public.profiles set role = 'admin', active = true, agency_id = null where username in ('sayed','mohamed');
-- Agency managers (see one agency only), e.g. Tiger:
--   update public.profiles set role = 'admin', active = true,
--     agency_id = (select id from public.agencies where name = 'تايجر')
--   where username in ('barqi','younis','aref');
-- (run in SQL editor; the guard trigger allows it because the SQL editor runs as postgres)
-- ---------------------------------------------------------------------
