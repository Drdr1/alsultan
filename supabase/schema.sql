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
--   owner (Sayed, Mohamed): is_owner = true -> every agency; only owners set permissions.
--   manager: scopes = [{"agency_id": "...", "rep_type": "retail"|"wholesale"}, ...] set by an owner;
--            sees only reps (and their customers / ledger) whose agency + type is in the list.
alter table public.profiles add column if not exists is_owner boolean not null default false;
alter table public.profiles add column if not exists scopes jsonb not null default '[]'::jsonb;
-- job title shown in the app, e.g. مدير عام / مدير فرع تايجر / مشرف تجزئة / مشرف جملة (set by owners)
alter table public.profiles add column if not exists title text;
-- what a manager may do besides looking: 'credit' (change credit limits), 'review' (corrections and returns),
-- 'coding' (give new customers a code). Owners can do all of it.
alter table public.profiles add column if not exists perms jsonb not null default '[]'::jsonb;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and active and is_owner);
$$;

create or replace function public.has_perm(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_owner() or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and active and perms ? p);
$$;

-- Is (agency, type) inside the current admin's scopes?
create or replace function public.in_my_scopes(p_agency uuid, p_type text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles me, jsonb_array_elements(me.scopes) e
    where me.id = auth.uid() and me.role = 'admin' and me.active
      and e->>'agency_id' = p_agency::text and e->>'rep_type' = p_type);
$$;

-- Can the current admin see / manage this rep (and the rep's customers and ledger)?
create or replace function public.can_manage_rep(rid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_owner() or exists (
    select 1 from public.profiles r
    where r.id = rid and r.role = 'rep' and public.in_my_scopes(r.agency_id, r.rep_type));
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
  if new.is_owner is distinct from old.is_owner and auth.uid() is not null then
    raise exception 'مينفعش تغيير المدير العام من هنا';
  end if;
  if auth.uid() is not null and public.is_owner() then
    if old.is_owner and old.id <> auth.uid() then raise exception 'مينفعش تعدّل حساب مدير عام تاني'; end if;
  elsif auth.uid() is not null then
    -- managers: only reps inside their scopes, never permissions, never move a rep outside their scopes
    if not public.can_manage_rep(old.id) then raise exception 'الحساب ده مش في صلاحياتك'; end if;
    if new.role <> old.role or new.scopes is distinct from old.scopes or new.title is distinct from old.title or new.perms is distinct from old.perms then raise exception 'الصلاحيات بيحددها المدير العام بس'; end if;
    if not public.in_my_scopes(new.agency_id, new.rep_type) then raise exception 'مينفعش تنقل مندوب لحاجة مش في صلاحياتك'; end if;
  end if;
  -- credit limits: only owners and whoever has the 'credit' permission (the branch accountant)
  if auth.uid() is not null and new.credit_limit is distinct from old.credit_limit and not public.has_perm('credit') then
    raise exception 'تعديل حد الائتمان للمحاسب والمدير العام بس';
  end if;
  insert into public.audit_log (entity, entity_id, action, details)
  values ('profile', old.id::text, 'update', jsonb_build_object(
    'before', jsonb_build_object('role', old.role, 'credit_limit', old.credit_limit, 'active', old.active, 'full_name', old.full_name, 'rep_type', old.rep_type, 'agency_id', old.agency_id, 'scopes', old.scopes),
    'after',  jsonb_build_object('role', new.role, 'credit_limit', new.credit_limit, 'active', new.active, 'full_name', new.full_name, 'rep_type', new.rep_type, 'agency_id', new.agency_id, 'scopes', new.scopes)));
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
-- shop name is "name"; the person who owns it is owner_name
alter table public.customers add column if not exists owner_name text;
alter table public.customers add column if not exists photo text; -- path of the shop photo in storage bucket shop-photos
-- a rep's new customer is a coding request (pending) until someone with the 'coding' permission gives it a code
alter table public.customers add column if not exists code text;
alter table public.customers add column if not exists status text not null default 'approved' check (status in ('pending','approved','rejected'));
alter table public.customers add column if not exists opening_amount numeric(14,2) not null default 0 check (opening_amount >= 0);
alter table public.customers add column if not exists opening_date timestamptz;
alter table public.customers add column if not exists reviewed_by uuid references public.profiles(id);
alter table public.customers add column if not exists reviewed_at timestamptz;
create unique index if not exists customers_code_key on public.customers(code) where code is not null;

create or replace function public.next_customer_code() returns text
language sql volatile security definer set search_path = public as $$
  select (greatest(1000, coalesce(max(code::bigint), 0)) + 1)::text from public.customers where code ~ '^[0-9]{1,15}$';
$$;

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
  new.opening_amount := greatest(coalesce(new.opening_amount, 0), 0);
  new.reviewed_by := null; new.reviewed_at := null;
  if me.role = 'admin' and public.has_perm('coding') then
    new.status := 'approved';
    new.code := coalesce(nullif(trim(new.code), ''), public.next_customer_code());
  else
    new.status := 'pending';
    new.code := null;
  end if;
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
  if (new.status, new.code) is distinct from (old.status, old.code) then
    if not public.has_perm('coding') then raise exception 'تكويد العملاء محتاج صلاحية'; end if;
    if old.status <> 'pending' and new.status is distinct from old.status then raise exception 'الطلب ده اتراجع قبل كده'; end if;
    if new.status = 'approved' and coalesce(trim(new.code), '') = '' then raise exception 'اكتب كود العميل'; end if;
  end if;
  if new.opening_amount is distinct from old.opening_amount or new.opening_date is distinct from old.opening_date then
    raise exception 'الرصيد الافتتاحي لا يعدل';
  end if;
  insert into public.audit_log (entity, entity_id, action, details)
  values ('customer', old.id::text, 'update', jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new)));
  return new;
end $$;

drop trigger if exists customers_guard_upd on public.customers;
create trigger customers_guard_upd before update on public.customers
  for each row execute function public.guard_customer_update();

create or replace function public.cairo_today() returns date
language sql stable as $$ select (now() at time zone 'Africa/Cairo')::date $$;

-- Daily closing: no fixed hours. The rep's day stays open until he closes it and a new one starts right after.
-- day = the date of the first entry in that closing; توريد = the collections.
create table if not exists public.day_closings (
  id           uuid primary key default gen_random_uuid(),
  rep_id       uuid not null default auth.uid() references public.profiles(id),
  day          date not null default public.cairo_today(),
  collections  numeric(14,2) not null default 0,
  invoices     numeric(14,2) not null default 0,
  returns      numeric(14,2) not null default 0,
  remitted     numeric(14,2) not null default 0 check (remitted >= 0),
  note         text,
  created_at   timestamptz not null default now()
);
alter table public.day_closings drop constraint if exists day_closings_rep_id_day_key;
create index if not exists day_closings_rep_idx on public.day_closings(rep_id, created_at);

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
  kind         text not null,
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
-- return = goods sent back: lowers the debt like a collection but is not counted as collection
alter table public.transactions drop constraint if exists transactions_kind_check;
alter table public.transactions add constraint transactions_kind_check check (kind in ('opening','invoice','collection','return','correction'));
alter table public.transactions add column if not exists invoice_no text;
create index if not exists tx_customer_idx on public.transactions(customer_id, occurred_at);
create index if not exists tx_rep_idx on public.transactions(rep_id, occurred_at);

create or replace function public.customer_balance(cid uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(case when kind in ('collection','return') then -amount else amount end), 0)
  from public.transactions where customer_id = cid and status = 'approved';
$$;

create or replace function public.rep_balance(rid uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(case when kind in ('collection','return') then -amount else amount end), 0)
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
  if cust.status <> 'approved' then raise exception 'العميل ده لسه مستني التكويد'; end if;
  if me.role = 'admin' and new.kind in ('correction','return') and not public.has_perm('review') then
    raise exception 'التصحيح والمرتجعات محتاجين صلاحية';
  end if;
  if new.kind = 'invoice' then
    if coalesce(trim(new.invoice_no), '') = '' then raise exception 'اكتب رقم الفاتورة'; end if;
    new.invoice_no := trim(new.invoice_no);
  else
    new.invoice_no := null;
  end if;

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
    new.status := case when new.kind in ('correction','return') then 'pending' else 'approved' end;
  else
    new.status := 'approved';
    new.reviewed_by := case when new.kind in ('correction','return') then me.id end;
    new.reviewed_at := case when new.kind in ('correction','return') then now() end;
  end if;

  if new.kind = 'opening' and exists (select 1 from public.transactions where customer_id = new.customer_id and kind = 'opening') then
    raise exception 'الرصيد الافتتاحي متسجل قبل كده';
  end if;

  if new.kind in ('collection','return') then
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
  if not public.has_perm('review') then raise exception 'مراجعة التصحيح والمرتجعات محتاجة صلاحية'; end if;
  if old.kind = 'return' and new.status = 'approved' and old.amount > public.customer_balance(old.customer_id) then
    raise exception 'المرتجع (%) أكبر من مديونية العميل (%)', old.amount, public.customer_balance(old.customer_id);
  end if;
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

create or replace function public.guard_closing_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare me public.profiles;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null or not me.active or me.role <> 'rep' then raise exception 'التقفيل للمندوب بس'; end if;
  new.rep_id := me.id;
  new.created_at := now();
  -- totals always come from the ledger (everything since his last closing), never from the phone
  select min(created_at) at time zone 'Africa/Cairo',
         coalesce(sum(amount) filter (where kind = 'collection'), 0),
         coalesce(sum(amount) filter (where kind = 'invoice'), 0),
         coalesce(sum(amount) filter (where kind = 'return'), 0)
    into new.day, new.collections, new.invoices, new.returns
    from public.transactions
   where rep_id = me.id and created_by = me.id and status <> 'rejected'
     and created_at > coalesce((select max(c.created_at) from public.day_closings c where c.rep_id = me.id), '-infinity');
  if new.day is null then raise exception 'مفيش حاجة تتقفل'; end if;
  new.remitted := new.collections; -- the cash handed in is the day's collections
  return new;
end $$;
drop trigger if exists closings_guard_ins on public.day_closings;
create trigger closings_guard_ins before insert on public.day_closings for each row execute function public.guard_closing_insert();
create or replace function public.block_update() returns trigger
language plpgsql as $$ begin raise exception 'التقفيل لا يعدل'; end $$;
drop trigger if exists closings_no_update on public.day_closings;
create trigger closings_no_update before update on public.day_closings for each row execute function public.block_update();
drop trigger if exists closings_no_delete on public.day_closings;
create trigger closings_no_delete before delete on public.day_closings for each row execute function public.block_delete();

-- Add customer in one call (p_debt_type is ignored: the type follows the rep).
-- From a rep it becomes a coding request; the opening balance is kept and posted when the customer gets a code.
drop function if exists public.add_customer(text, text, text, text, numeric, timestamptz, uuid);
-- A customer can only be coded (activated) when everything is filled in, shop photo included.
create or replace function public.customer_missing(c public.customers) returns text
language sql immutable as $$
  select nullif(concat_ws('، ',
    case when coalesce(trim(c.name), '') = '' then 'اسم المحل' end,
    case when coalesce(trim(c.owner_name), '') = '' then 'اسم صاحب المحل' end,
    case when coalesce(trim(c.phone), '') = '' then 'التليفون' end,
    case when coalesce(trim(c.location), '') = '' then 'العنوان' end,
    case when coalesce(c.photo, '') = '' then 'صورة المحل' end), '')
$$;

-- One phone number = one customer (compared by digits; +20 / 0020 means 0).
create or replace function public.norm_phone(p text) returns text
language sql immutable as $$
  select case when d like '0020%' then '0' || substr(d, 5) when d like '20%' and length(d) = 12 then '0' || substr(d, 3)
              when length(d) = 10 and d like '1%' then '0' || d else d end
  from (select regexp_replace(translate(coalesce(p, ''), '٠١٢٣٤٥٦٧٨٩', '0123456789'), '\D', '', 'g') as d) x
$$;
create unique index if not exists customers_phone_key on public.customers (public.norm_phone(phone)) where status <> 'rejected' and coalesce(phone, '') <> '';
create or replace function public.phone_owner(p text) returns text
language sql stable security definer set search_path = public as $$
  select name from public.customers where status <> 'rejected' and public.norm_phone(phone) = public.norm_phone(p) limit 1
$$;

drop function if exists public.add_customer(text, text, text, text, numeric, timestamptz, uuid, text);
create or replace function public.add_customer(
  p_name text, p_phone text, p_location text, p_debt_type text,
  p_opening numeric, p_opening_date timestamptz, p_rep_id uuid default null, p_owner_name text default null, p_photo text default null
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare c public.customers;
begin
  c.name := trim(p_name); c.owner_name := nullif(trim(p_owner_name),''); c.phone := nullif(trim(p_phone),''); c.location := nullif(trim(p_location),''); c.photo := nullif(p_photo,'');
  if public.customer_missing(c) is not null then raise exception 'ناقص: %', public.customer_missing(c); end if;
  if public.phone_owner(c.phone) is not null then raise exception 'رقم التليفون ده متسجل لعميل تاني (%)', public.phone_owner(c.phone); end if;
  insert into public.customers (rep_id, name, owner_name, phone, location, photo, debt_type, opening_amount, opening_date)
  values (coalesce(p_rep_id, auth.uid()), c.name, c.owner_name, c.phone, c.location, c.photo, p_debt_type,
          greatest(coalesce(p_opening, 0), 0), p_opening_date)
  returning * into c;
  if c.status = 'approved' and c.opening_amount > 0 then
    insert into public.transactions (customer_id, rep_id, kind, amount, note, occurred_at)
    values (c.id, c.rep_id, 'opening', c.opening_amount, 'رصيد افتتاحي', coalesce(c.opening_date, now()));
  end if;
  return c.id;
end $$;

-- Approve (give a code) or refuse a coding request.
create or replace function public.code_customer(p_id uuid, p_approve boolean, p_code text default null) returns void
language plpgsql security invoker set search_path = public as $$
declare c public.customers;
begin
  if not public.has_perm('coding') then raise exception 'تكويد العملاء محتاج صلاحية'; end if;
  select * into c from public.customers where id = p_id;
  if c.id is null or c.status <> 'pending' then raise exception 'الطلب ده اتراجع قبل كده'; end if;
  if p_approve then
    if public.customer_missing(c) is not null then raise exception 'مينفعش يتكوّد، ناقص: %', public.customer_missing(c); end if;
    if coalesce(trim(p_code), '') = '' then raise exception 'اكتب كود العميل'; end if;
    if exists (select 1 from public.customers where code = trim(p_code)) then raise exception 'الكود ده متسجل لعميل تاني'; end if;
    update public.customers set status = 'approved', code = trim(p_code), reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;
    if c.opening_amount > 0 then
      insert into public.transactions (customer_id, rep_id, kind, amount, note, occurred_at)
      values (c.id, c.rep_id, 'opening', c.opening_amount, 'رصيد افتتاحي', least(coalesce(c.opening_date, now()), now()));
    end if;
  else
    update public.customers set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles     enable row level security;
alter table public.customers    enable row level security;
alter table public.transactions enable row level security;
alter table public.audit_log    enable row level security;
alter table public.agencies     enable row level security;
alter table public.day_closings enable row level security;

drop policy if exists closings_select on public.day_closings;
create policy closings_select on public.day_closings for select using (rep_id = auth.uid() or public.can_manage_rep(rep_id));
drop policy if exists closings_insert on public.day_closings;
create policy closings_insert on public.day_closings for insert with check (rep_id = auth.uid());

-- Agency names are public (the sign-up page lists them; the app hides other agencies from managers).
-- Only owners add or rename agencies.
drop policy if exists agencies_select on public.agencies;
create policy agencies_select on public.agencies for select using (true);
drop policy if exists agencies_insert on public.agencies;
create policy agencies_insert on public.agencies for insert with check (public.is_owner());
drop policy if exists agencies_update on public.agencies;
create policy agencies_update on public.agencies for update using (public.is_owner());
grant select on public.agencies to anon;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (
  id = auth.uid() or public.can_manage_rep(id) or (public.is_admin() and is_owner));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update using (public.can_manage_rep(id));

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
create policy audit_select on public.audit_log for select using (public.is_owner());

-- ---------------------------------------------------------------------
-- Realtime (instant updates without refresh)
-- ---------------------------------------------------------------------
do $$ begin
  begin alter publication supabase_realtime add table public.transactions; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.customers;    exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.profiles;     exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.agencies;     exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.day_closings; exception when duplicate_object then null; end;
end $$;

-- ---------------------------------------------------------------------
-- After Sayed and Mohamed sign up from the site, make them the owners:
--   update public.profiles set role = 'admin', active = true, is_owner = true, title = 'مدير عام' where username in ('sayed','mohamed');
-- Managers are then set up by the owners from the app's settings page (no SQL needed).
-- (run in SQL editor; the guard trigger allows it because the SQL editor runs as postgres)
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- Shop photos (Supabase Storage, private bucket). Path: <uploader id>/<file>.jpg
-- ---------------------------------------------------------------------
do $$ begin
  insert into storage.buckets (id, name, public) values ('shop-photos', 'shop-photos', false) on conflict (id) do nothing;
  drop policy if exists shop_photos_insert on storage.objects;
  create policy shop_photos_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'shop-photos' and (storage.foldername(name))[1] = auth.uid()::text);
  drop policy if exists shop_photos_select on storage.objects;
  create policy shop_photos_select on storage.objects for select to authenticated
    using (bucket_id = 'shop-photos' and exists (select 1 from public.customers c where c.photo = storage.objects.name));
exception when undefined_table or invalid_schema_name or undefined_function then
  raise notice 'storage schema not found, skipping shop-photos bucket';
end $$;
