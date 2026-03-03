-- SCRIPT DE EMERGENCIA
-- 1. Mata todas las conexiones que pueden estar trabando la base de datos
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE pid <> pg_backend_pid()
AND datname = current_database();

-- 2. Intenta crear el índice ligero inmediatamente
CREATE INDEX IF NOT EXISTS idx_users_dni ON users(dni);
