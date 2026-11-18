-- Migration for pet contact data, photo storage, and walks with multiple pets.
-- Run in the Supabase SQL editor after the existing schema.

alter table public.pets
  add column if not exists photo_url text,
  add column if not exists birth_date date,
  add column if not exists address text,
  add column if not exists contact_phone text;

create table if not exists public.walk_pets (
  walk_id uuid not null references public.walks(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  created_at timestamptz not null default timezone('utc'::text, now()),
  primary key (walk_id, pet_id)
);

alter table public.walks
  add column if not exists pet_id uuid references public.pets(id) on delete cascade,
  add column if not exists distance_meters numeric,
  add column if not exists route jsonb;
alter table public.walks
  alter column pet_id drop not null;

alter table public.walk_pets enable row level security;
drop policy if exists "Owners view walk pet links" on public.walk_pets;
create policy "Owners view walk pet links"
  on public.walk_pets for select
  using (
    exists (
      select 1 from public.pets p
      where p.id = walk_pets.pet_id and p.owner_id = auth.uid()
    )
  );

drop policy if exists "Users can view walks of their pets" on public.walks;
create policy "Users can view walks of their pets"
  on public.walks for select
  using (
    exists (
      select 1 from public.walk_pets wp
      join public.pets p on p.id = wp.pet_id
      where wp.walk_id = walks.id and p.owner_id = auth.uid()
    )
    or (
      walks.pet_id is not null and exists (
        select 1 from public.pets p
        where p.id = walks.pet_id and p.owner_id = auth.uid()
      )
    )
  );

insert into storage.buckets (id, name, public)
values ('pet_photos', 'pet_photos', true)
on conflict (id) do update set public = excluded.public;

create or replace function public.can_upload_pet_photo(p_pet_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.pets p
    where p.id::text = p_pet_id
      and p.owner_id = (select auth.uid())
      and p.is_linked = true
  );
$$;

revoke all on function public.can_upload_pet_photo(text) from public, anon;
grant execute on function public.can_upload_pet_photo(text) to authenticated;

drop policy if exists "Owners upload pet photos" on storage.objects;
create policy "Owners upload pet photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'pet_photos'
    and public.can_upload_pet_photo((storage.foldername(name))[1])
  );

drop policy if exists "Owners delete pet photos" on storage.objects;
create policy "Owners delete pet photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'pet_photos'
    and public.can_upload_pet_photo((storage.foldername(name))[1])
  );

create or replace function public.save_walk_with_pets(
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_duration_seconds integer,
  p_distance_meters numeric,
  p_route jsonb,
  p_pet_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  new_walk_id uuid;
begin
  if current_user_id is null then
    raise exception 'Debes iniciar sesión para guardar un paseo.';
  end if;
  if p_start_time is null or p_end_time is null or p_end_time < p_start_time then
    raise exception 'El intervalo de tiempo del paseo no es válido.';
  end if;
  if p_duration_seconds < 0 or p_distance_meters < 0 then
    raise exception 'La duración y la distancia no pueden ser negativas.';
  end if;
  if coalesce(array_length(p_pet_ids, 1), 0) = 0 then
    raise exception 'Selecciona al menos una mascota para el paseo.';
  end if;
  if exists (
    select 1
    from unnest(p_pet_ids) as selected(pet_id)
    left join public.pets p on p.id = selected.pet_id
    where p.id is null or p.owner_id <> current_user_id or p.is_linked is not true
  ) then
    raise exception 'Una o más mascotas no pertenecen a tu cuenta.';
  end if;

  insert into public.walks (pet_id, start_time, end_time, duration_seconds, distance_meters, route)
  values (null, p_start_time, p_end_time, p_duration_seconds, p_distance_meters, coalesce(p_route, '[]'::jsonb))
  returning id into new_walk_id;

  insert into public.walk_pets (walk_id, pet_id)
  select new_walk_id, selected.pet_id
  from (select distinct unnest(p_pet_ids) as pet_id) selected;

  return new_walk_id;
end;
$$;

revoke all on function public.save_walk_with_pets(timestamptz, timestamptz, integer, numeric, jsonb, uuid[]) from public, anon;
grant execute on function public.save_walk_with_pets(timestamptz, timestamptz, integer, numeric, jsonb, uuid[]) to authenticated;

drop function if exists public.link_pet_by_qr(text);
drop function if exists public.register_pet_from_qr(text, text, integer, text);
create function public.link_pet_by_qr(p_qr_token text)
returns table (
  id uuid,
  name text,
  breed text,
  birth_date date,
  photo_url text,
  address text,
  contact_phone text,
  is_linked boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión antes de vincular una mascota.';
  end if;
  if nullif(btrim(p_qr_token), '') is null then
    raise exception 'El código QR está vacío.';
  end if;
  if not exists (
    select 1 from public.pets p where p.qr_token = btrim(p_qr_token)
  ) then
    raise exception 'QR no registrado: no existe una mascota con ese token.';
  end if;
  if exists (
    select 1 from public.pets p
    where p.qr_token = btrim(p_qr_token) and p.owner_id is not null
  ) then
    raise exception 'Esta mascota ya está vinculada a una cuenta.';
  end if;

  return query
  update public.pets p
  set owner_id = auth.uid(), is_linked = true
  where p.qr_token = btrim(p_qr_token)
    and p.owner_id is null
  returning p.id, p.name, p.breed, p.birth_date, p.photo_url,
            p.address, p.contact_phone, p.is_linked;

  if not found then
    raise exception 'QR inválido o mascota ya vinculada a una cuenta.';
  end if;
end;
$$;
revoke all on function public.link_pet_by_qr(text) from public, anon;
grant execute on function public.link_pet_by_qr(text) to authenticated;

drop function if exists public.register_pet_from_qr(text, text, integer, text);
drop function if exists public.register_pet_from_qr(text, text, date, text);
drop function if exists public.register_pet_from_qr(text, text, date, text, text, text);
create function public.register_pet_from_qr(
  p_name text,
  p_breed text,
  p_birth_date date,
  p_qr_token text,
  p_address text default null,
  p_contact_phone text default null
)
returns table (
  id uuid,
  name text,
  breed text,
  birth_date date,
  photo_url text,
  address text,
  contact_phone text,
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
  if p_birth_date is not null and p_birth_date > current_date then
    raise exception 'La fecha de nacimiento del QR no es válida.';
  end if;
  if nullif(btrim(p_qr_token), '') is null then
    raise exception 'El QR no contiene un token válido.';
  end if;
  if exists (
    select 1 from public.pets p where p.qr_token = btrim(p_qr_token)
  ) then
    raise exception 'Este token QR ya fue utilizado. Escanea un QR nuevo para registrar otra mascota.';
  end if;

  insert into public.pets (
    owner_id, name, breed, birth_date, address, contact_phone, qr_token, is_linked
  )
  values (
    current_user_id,
    btrim(p_name),
    btrim(p_breed),
    p_birth_date,
    nullif(btrim(p_address), ''),
    nullif(btrim(p_contact_phone), ''),
    btrim(p_qr_token),
    true
  )
  returning * into inserted_pet;

  return query
  select inserted_pet.id, inserted_pet.name, inserted_pet.breed, inserted_pet.birth_date,
         inserted_pet.photo_url, inserted_pet.address, inserted_pet.contact_phone, inserted_pet.is_linked;
exception
  when unique_violation then
    raise exception 'Este token QR ya fue utilizado. Escanea un QR nuevo para registrar otra mascota.';
end;
$$;
revoke all on function public.register_pet_from_qr(text, text, date, text, text, text) from public, anon;
grant execute on function public.register_pet_from_qr(text, text, date, text, text, text) to authenticated;

create or replace function public.get_pet_walk_history(p_pet_id uuid)
returns table (
  id uuid,
  start_time timestamptz,
  end_time timestamptz,
  duration_seconds integer,
  distance_meters numeric,
  route jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.pets p where p.id = p_pet_id and p.owner_id = auth.uid()
  ) then
    raise exception 'No tienes permiso para consultar el historial de esta mascota.';
  end if;

  return query
  select w.id, w.start_time, w.end_time, w.duration_seconds, w.distance_meters, w.route
  from public.walks w
  where exists (select 1 from public.walk_pets wp where wp.walk_id = w.id and wp.pet_id = p_pet_id)
     or w.pet_id = p_pet_id
  order by w.start_time desc;
end;
$$;

revoke all on function public.get_pet_walk_history(uuid) from public, anon;
grant execute on function public.get_pet_walk_history(uuid) to authenticated;

create or replace function public.update_pet_profile(
  p_pet_id uuid,
  p_birth_date date,
  p_address text,
  p_contact_phone text
)
returns table (
  id uuid,
  name text,
  breed text,
  birth_date date,
  photo_url text,
  address text,
  contact_phone text,
  is_linked boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para actualizar el perfil.';
  end if;
  if p_birth_date > current_date then
    raise exception 'La fecha de nacimiento no puede estar en el futuro.';
  end if;
  if nullif(btrim(p_contact_phone), '') is not null
    and btrim(p_contact_phone) !~ '^[+]?[0-9() .-]*[0-9][0-9() .-]*$' then
    raise exception 'El teléfono solo puede contener números y los símbolos +, espacios, paréntesis o guiones.';
  end if;

  return query
  update public.pets p
  set birth_date = p_birth_date,
      address = nullif(btrim(p_address), ''),
      contact_phone = nullif(btrim(p_contact_phone), '')
  where p.id = p_pet_id and p.owner_id = auth.uid()
  returning p.id, p.name, p.breed, p.birth_date, p.photo_url,
            p.address, p.contact_phone, p.is_linked, p.created_at;

  if not found then
    raise exception 'No encontramos la mascota o no tienes permiso para actualizarla.';
  end if;
end;
$$;

revoke all on function public.update_pet_profile(uuid, date, text, text) from public, anon;
grant execute on function public.update_pet_profile(uuid, date, text, text) to authenticated;

create or replace function public.update_pet_photo(p_pet_id uuid, p_photo_url text)
returns table (
  id uuid,
  name text,
  breed text,
  birth_date date,
  photo_url text,
  address text,
  contact_phone text,
  is_linked boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para cambiar la foto.';
  end if;
  if p_photo_url is null or position(
    '/storage/v1/object/public/pet_photos/' || p_pet_id::text || '/' in p_photo_url
  ) = 0 then
    raise exception 'La ruta de la foto no pertenece al almacenamiento de mascotas.';
  end if;

  return query
  update public.pets p
  set photo_url = p_photo_url
  where p.id = p_pet_id and p.owner_id = auth.uid()
  returning p.id, p.name, p.breed, p.birth_date, p.photo_url,
            p.address, p.contact_phone, p.is_linked, p.created_at;

  if not found then
    raise exception 'No encontramos la mascota o no tienes permiso para actualizarla.';
  end if;
end;
$$;

revoke all on function public.update_pet_photo(uuid, text) from public, anon;
grant execute on function public.update_pet_photo(uuid, text) to authenticated;

drop function if exists public.get_public_pet_by_qr_token(text);
create function public.get_public_pet_by_qr_token(p_qr_token text)
returns table (
  name text,
  birth_date date,
  photo_url text,
  address text,
  contact_phone text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.name, p.birth_date, p.photo_url, p.address, p.contact_phone
  from public.pets p
  where p.qr_token = btrim(p_qr_token)
  limit 1;
$$;

revoke all on function public.get_public_pet_by_qr_token(text) from public;
grant execute on function public.get_public_pet_by_qr_token(text) to anon, authenticated;

notify pgrst, 'reload schema';
