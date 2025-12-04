import { createClient } from '@supabase/supabase-js';

// En un entorno de producción real, estas variables deberían estar en .env
// Para este paso a paso, las configuramos directamente según lo solicitado.
const SUPABASE_URL = 'https://stbovhmioboxozheflcw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0Ym92aG1pb2JveG96aGVmbGN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4MDg0NzcsImV4cCI6MjA4MDM4NDQ3N30.4OLX_o6wf4as0ULPuvwlpFp33ZUu5z-eUqSLoNrl19M';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);