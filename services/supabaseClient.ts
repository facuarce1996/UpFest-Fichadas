
import { createClient } from '@supabase/supabase-js';

// Reemplaza estos valores con los de tu NUEVO proyecto de Supabase
const SUPABASE_URL = 'ESCRIBE_AQUI_TU_NUEVA_URL';
const SUPABASE_ANON_KEY = 'ESCRIBE_AQUI_TU_NUEVA_ANON_KEY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
