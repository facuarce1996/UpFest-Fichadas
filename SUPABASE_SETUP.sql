
-- UPFEST CONTROL - SCRIPT DE REINSTALACIÓN v9 (ESTRUCTURA ESPEJO CSV)
-- Este script asegura compatibilidad total con el importador de Supabase para IDs preexistentes.

-- 1. Borrar tablas existentes para limpieza total
DROP TABLE IF EXISTS public.logs;
DROP TABLE IF EXISTS public.users;
DROP TABLE IF EXISTS public.locations;
DROP TABLE IF EXISTS public.app_settings;

-- 2. Crear tabla de Usuarios
CREATE TABLE public.users (
  id TEXT PRIMARY KEY,
  legajo TEXT,
  dni TEXT UNIQUE NOT NULL,
  password TEXT DEFAULT '1234',
  name TEXT NOT NULL,
  role TEXT DEFAULT 'Mozo',
  dress_code TEXT,
  reference_image TEXT,
  schedule JSONB DEFAULT '[]',
  assigned_locations JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Crear tabla de Sedes
CREATE TABLE public.locations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  radius_meters INTEGER DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Crear tabla de Fichadas (Logs) optimizada para importación manual
CREATE TABLE public.logs (
  id TEXT PRIMARY KEY, -- Acepta el ID del CSV (UUID o string)
  user_id TEXT,
  user_name TEXT,
  legajo TEXT,
  timestamp TEXT,      -- Importamos como TEXT para evitar errores de zona horaria o formato del CSV
  type TEXT,
  location_id TEXT,
  location_name TEXT,
  location_status TEXT,
  schedule_status TEXT,
  dress_code_status TEXT,
  identity_status TEXT,
  photo_evidence TEXT,
  ai_feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar ID automático para registros nuevos que vengan desde la APP
ALTER TABLE public.logs ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

-- 5. Crear tabla de Configuración
CREATE TABLE public.app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Deshabilitar RLS (Seguridad) para facilitar la conexión cliente-servidor
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings DISABLE ROW LEVEL SECURITY;

-- 7. Notificar recarga de esquema
NOTIFY pgrst, 'reload schema';
