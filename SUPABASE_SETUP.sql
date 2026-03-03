-- Habilitar extensión para UUIDs
create extension if not exists "uuid-ossp";

-- 1. Tabla de USUARIOS
create table if not exists users (
  id uuid primary key default uuid_generate_v4(),
  dni text unique not null,
  name text not null,
  role text not null,
  legajo text,
  password text,
  dress_code text,
  reference_image text,
  schedule jsonb default '[]'::jsonb,
  assigned_locations jsonb default '[]'::jsonb,
  is_active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 2. Tabla de REGISTROS (Fichadas)
create table if not exists logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id),
  user_name text,
  legajo text,
  timestamp text,
  type text,
  location_id text,
  location_name text,
  location_status text,
  dress_code_status text,
  identity_status text,
  schedule_status text,
  photo_evidence text,
  ai_feedback text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 3. Tabla de UBICACIONES (Sedes)
create table if not exists locations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  address text,
  city text,
  lat double precision,
  lng double precision,
  radius_meters integer default 100,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 4. Tabla de CONFIGURACIÓN (Logo)
create table if not exists company_settings (
  id uuid primary key default uuid_generate_v4(),
  logo_url text,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Habilitar Row Level Security (RLS)
alter table users enable row level security;
alter table logs enable row level security;
alter table locations enable row level security;
alter table company_settings enable row level security;

-- Políticas de acceso (Permitir todo a la API anónima para que la app funcione sin login de Supabase Auth)
-- NOTA: En producción, deberías restringir esto, pero para que la app funcione ahora:

create policy "Enable all access for all users" on users for all using (true) with check (true);
create policy "Enable all access for all users" on logs for all using (true) with check (true);
create policy "Enable all access for all users" on locations for all using (true) with check (true);
create policy "Enable all access for all users" on company_settings for all using (true) with check (true);

-- Insertar usuario Admin por defecto si no existe
insert into users (dni, name, role, password, is_active)
values ('00000000', 'Administrador', 'Admin', 'admin123', true)
on conflict (dni) do nothing;
