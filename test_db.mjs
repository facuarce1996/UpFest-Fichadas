import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const envContent = fs.readFileSync('.env', 'utf-8');
const VITE_SUPABASE_URL = envContent.match(/VITE_SUPABASE_URL=(.*)/)?.[1] || '';
const VITE_SUPABASE_ANON_KEY = envContent.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1] || '';

const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY);

async function main() {
  const { data, error } = await supabase.from('users').select('name, reference_image').limit(10);
  console.log("USERS:", JSON.stringify(data, null, 2), "ERROR:", error);

  const { data: d2, error: d2e } = await supabase.from('app_settings').select('*').limit(5);
  console.log("APP_SETTINGS:", JSON.stringify(d2, null, 2), "ERROR:", d2e);

  const { data: d3, error: d3e } = await supabase.from('company_settings').select('*').limit(5);
  console.log("COMPANY_SETTINGS:", JSON.stringify(d3, null, 2), "ERROR:", d3e);

}
main();
