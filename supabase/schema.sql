create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.pets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete cascade,
  name text not null,
  breed text,
  age integer,
  qr_token text unique not null,
  is_linked boolean not null default false,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.walks (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  start_time timestamptz not null,
  end_time timestamptz,
  duration_seconds integer,
  distance_meters numeric,
  route jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.pet_notes (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid references public.pets(id) on delete cascade,
  note_text text not null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.pet_appointments (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid references public.pets(id) on delete cascade,
  title text not null,
  appointment_date timestamptz not null,
  description text,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.create_profile_for_new_user();

insert into public.profiles (id, full_name)
select id, raw_user_meta_data ->> 'full_name'
from auth.users
on conflict (id) do nothing;

alter table public.profiles enable row level security;
alter table public.pets enable row level security;
alter table public.walks enable row level security;
alter table public.pet_notes enable row level security;
alter table public.pet_appointments enable row level security;

drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can view their pets" on public.pets;
create policy "Users can view their pets"
  on public.pets for select
  using (auth.uid() = owner_id and is_linked = true);

drop policy if exists "Users can update their pets" on public.pets;
create policy "Users can update their pets"
  on public.pets for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "Users can view walks of their pets" on public.walks;
create policy "Users can view walks of their pets"
  on public.walks for select
  using (
    exists (
      select 1 from public.pets
      where pets.id = walks.pet_id and pets.owner_id = auth.uid()
    )
  );

drop policy if exists "Users can insert walks for their pets" on public.walks;
create policy "Users can insert walks for their pets"
  on public.walks for insert
  with check (
    exists (
      select 1 from public.pets
      where pets.id = walks.pet_id and pets.owner_id = auth.uid()
    )
  );

drop policy if exists "Owners manage pet notes" on public.pet_notes;
create policy "Owners manage pet notes"
  on public.pet_notes for all
  using (
    exists (
      select 1 from public.pets
      where pets.id = pet_notes.pet_id and pets.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.pets
      where pets.id = pet_notes.pet_id and pets.owner_id = auth.uid()
    )
  );

drop policy if exists "Owners manage pet appointments" on public.pet_appointments;
create policy "Owners manage pet appointments"
  on public.pet_appointments for all
  using (
    exists (
      select 1 from public.pets
      where pets.id = pet_appointments.pet_id and pets.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.pets
      where pets.id = pet_appointments.pet_id and pets.owner_id = auth.uid()
    )
  );

create or replace function public.link_pet_by_qr(p_qr_token text)
returns table (
  id uuid,
  name text,
  breed text,
  age integer,
  is_linked boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Debes iniciar sesión antes de vincular una mascota.';
  end if;

  if nullif(btrim(p_qr_token), '') is null then
    raise exception 'El código QR está vacío.';
  end if;

  if exists (
    select 1 from public.pets as p
    where p.qr_token = btrim(p_qr_token) and p.owner_id is not null
  ) then
    raise exception 'Esta mascota ya está vinculada a una cuenta.';
  end if;

  return query
  update public.pets as p
  set owner_id = current_user_id,
      is_linked = true
  where p.qr_token = btrim(p_qr_token)
    and p.owner_id is null
  returning p.id, p.name, p.breed, p.age, p.is_linked;

  if not found then
    raise exception 'QR inválido o mascota ya vinculada a una cuenta.';
  end if;
end;
$$;

revoke all on function public.link_pet_by_qr(text) from public, anon;
grant execute on function public.link_pet_by_qr(text) to authenticated;

create or replace function public.register_pet_from_qr(
  p_name text,
  p_breed text,
  p_age integer,
  p_qr_token text
)
returns table (
  id uuid,
  name text,
  breed text,
  age integer,
  is_linked boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  inserted_pet public.pets%rowtype;
begin
  if current_user_id is null then
    raise exception 'Debes iniciar sesión antes de registrar una mascota.';
  end if;

  if nullif(btrim(p_name), '') is null or nullif(btrim(p_breed), '') is null then
    raise exception 'El QR debe incluir nombre y raza.';
  end if;

  if p_age is null or p_age < 0 or p_age > 100 then
    raise exception 'La edad debe estar entre 0 y 100 años.';
  end if;

  if nullif(btrim(p_qr_token), '') is null then
    raise exception 'El QR no contiene un token válido.';
  end if;

  if exists (select 1 from public.pets as p where p.qr_token = btrim(p_qr_token)) then
    raise exception 'Este QR ya fue registrado. Escanea el código asignado a una mascota nueva.';
  end if;

  insert into public.pets (owner_id, name, breed, age, qr_token, is_linked)
  values (current_user_id, btrim(p_name), btrim(p_breed), p_age, btrim(p_qr_token), true)
  returning * into inserted_pet;

  return query
  select inserted_pet.id, inserted_pet.name, inserted_pet.breed,
         inserted_pet.age, inserted_pet.is_linked;
end;
$$;

revoke all on function public.register_pet_from_qr(text, text, integer, text) from public, anon;
grant execute on function public.register_pet_from_qr(text, text, integer, text) to authenticated;

-- Sustituye estos tokens por los que imprimas en los collares.
insert into public.pets (name, breed, age, qr_token, is_linked)
values
  ('Morita', 'Mestiza', 3, 'QR_MORITA_12345', false),
  ('Darla', 'Labrador', 2, 'QR_DARLA_67890', false)
on conflict (qr_token) do nothing;
