
-- UPFEST CONTROL - REINICIO DE ESQUEMA PROFESIONAL (v4.2)

-- 1. LIMPIEZA TOTAL (Borra tablas si existen para evitar errores de duplicado)
DROP TABLE IF EXISTS public.logs CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;
DROP TABLE IF EXISTS public.locations CASCADE;
DROP TABLE IF EXISTS public.app_settings CASCADE;

-- 2. CREACIÓN DE TABLAS CON TIPOS FLEXIBLES (TEXT)

-- Tabla de Usuarios
CREATE TABLE public.users (
  id TEXT PRIMARY KEY, 
  dni TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  legajo TEXT,
  dress_code TEXT DEFAULT 'Remera naranja de la empresa',
  reference_image TEXT, 
  schedule JSONB DEFAULT '[]', 
  assigned_locations JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de Sedes
CREATE TABLE public.locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT DEFAULT 'CABA',
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  radius_meters INTEGER DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de Fichadas
CREATE TABLE public.logs (
  id TEXT PRIMARY KEY,
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

-- Tabla de Configuraciones
CREATE TABLE public.app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. SEGURIDAD Y PERMISOS
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings DISABLE ROW LEVEL SECURITY;

-- 4. INSERTAR USUARIO ADMINISTRADOR INICIAL (Opcional, para entrar directo)
-- DNI: 1234, Pass: 1234
INSERT INTO public.users (id, dni, password, name, role, is_active)
VALUES ('admin-001', '1234', '1234', 'ADMINISTRADOR UPFEST', 'Admin', true)
ON CONFLICT (dni) DO NOTHING;

-- Notificar recarga de esquema
NOTIFY pgrst, 'reload schema';
