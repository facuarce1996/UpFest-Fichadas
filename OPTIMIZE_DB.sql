-- Optimización de Índices para reducir uso de CPU

-- 1. Índice para búsquedas por DNI (Login)
create index if not exists idx_users_dni on users(dni);

-- 2. Índice para filtrado y ordenamiento por fecha (Dashboard y Logs)
create index if not exists idx_logs_timestamp on logs(timestamp desc);

-- 3. Índice para buscar logs por usuario (Historial personal)
create index if not exists idx_logs_user_id on logs(user_id);

-- 4. Índice compuesto para búsquedas frecuentes de logs por usuario y fecha
create index if not exists idx_logs_user_timestamp on logs(user_id, timestamp desc);

-- 5. Analizar tablas para actualizar estadísticas del planificador de consultas
analyze users;
analyze logs;
