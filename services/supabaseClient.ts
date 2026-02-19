
import { createClient } from '@supabase/supabase-js';

// Nuevas credenciales del proyecto de producción
const SUPABASE_URL = 'https://waqlznjozdnltpxihtws.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndhcWx6bmpvemRubHRweGlodHdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNTI1ODUsImV4cCI6MjA4NjgyODU4NX0.8PKsKA72y1XrY_A1HuB9Yy8XMuAfI-QsnoJXWG06zzU';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
