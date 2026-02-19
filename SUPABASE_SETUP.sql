
-- UPFEST CONTROL - DATABASE SCHEMA (v4.1 - Flexible IDs)

-- 1. Usuarios y Personal
CREATE TABLE public.users (
  id TEXT PRIMARY KEY, -- Cambiado a TEXT para máxima flexibilidad
  dni TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  legajo TEXT,
  dress_code TEXT DEFAULT 'Remera naranja de la empresa',
  reference_image TEXT, 
  schedule JSONB DEFAULT '[]', 
  assigned_locations JSONB DEFAULT '[]', -- Cambiado a JSONB para evitar errores de casteo de UUID[]
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Sedes de Eventos
CREATE TABLE public.locations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT DEFAULT 'CABA',
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  radius_meters INTEGER DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Registros de Fichadas
CREATE TABLE public.logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT,
  user_name TEXT,
  legajo TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  type TEXT CHECK (type IN ('CHECK_IN', 'CHECK_OUT')),
  location_id TEXT,
  location_name TEXT,
  location_status TEXT, 
  dress_code_status TEXT, 
  identity_status TEXT, 
  schedule_status TEXT,
  photo_evidence TEXT, 
  ai_feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Configuraciones de la App
CREATE TABLE public.app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS (Row Level Security) - Deshabilitado para prototipo
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings DISABLE ROW LEVEL SECURITY;

-- Notificar a PostgREST para recargar el esquema
NOTIFY pgrst, 'reload schema';
