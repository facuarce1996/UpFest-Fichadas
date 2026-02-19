
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://waqlznjozdnltpxihtws.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndhcWx6bmpvemRubHRweGlodHdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNTI1ODUsImV4cCI6MjA4NjgyODU4NX0.8PKsKA72y1XrY_A1HuB9Yy8XMuAfI-QsnoJXWG06zzU'; // Anon key publica provista

export const supabase = createClient(supabaseUrl, supabaseKey);
