
-- UPFEST CONTROL - DATABASE SCHEMA

-- 1. Usuarios y Personal
CREATE TABLE public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dni TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  dress_code TEXT DEFAULT 'Remera naranja de la empresa',
  reference_image TEXT, -- Base64 o URL
  schedule JSONB DEFAULT '[]', -- Horarios semanales
  assigned_locations UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Sedes de Eventos
CREATE TABLE public.locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT DEFAULT 'CABA',
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  radius_meters INTEGER DEFAULT 100, -- Radio de geofencing
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Registros de Fichadas
CREATE TABLE public.logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id),
  user_name TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  type TEXT CHECK (type IN ('CHECK_IN', 'CHECK_OUT')),
  location_id UUID REFERENCES public.locations(id),
  location_name TEXT,
  location_status TEXT, -- 'VALID', 'INVALID', 'SKIPPED'
  dress_code_status TEXT, -- 'PASS', 'FAIL'
  identity_status TEXT, -- 'MATCH', 'NO_MATCH'
  photo_evidence TEXT, -- Base64
  ai_feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Incidencias
CREATE TABLE public.incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id),
  date DATE DEFAULT CURRENT_DATE,
  type TEXT NOT NULL, -- 'Llegada tarde', 'Falta', 'Bonificación'
  amount DECIMAL(10,2) DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Configuraciones de la App
CREATE TABLE public.app_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- RLS (Row Level Security) - Para este prototipo lo deshabilitamos para facilitar acceso
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings DISABLE ROW LEVEL SECURITY;
