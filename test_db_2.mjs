import { createClient } from '@supabase/supabase-js';

// Hack to read env vars directly from process inside the handler
// But since we run this as a standalone script we have to use fs
import fs from 'fs';
const envContent = fs.readFileSync('.env', 'utf-8');
const VITE_SUPABASE_URL = envContent.match(/VITE_SUPABASE_URL=(.*)/)?.[1] || '';
const VITE_SUPABASE_ANON_KEY = envContent.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1] || '';

const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY);

async function main() {
  const { data } = await supabase.from('users').select('name, reference_image').limit(20);
  for (const u of data||[]) {
    const val = u.reference_image;
    let type = typeof val;
    let info = "";
    if (!val) {
      info = "null";
    } else if (val.startsWith('http')) {
      info = "URL";
    } else if (val.startsWith('data:image')) {
      info = "Base64";
    } else {
      info = "String (length: " + val.length + "): " + val.substring(0, 50);
    }
    console.log(u.name, "=>", info);
  }
}
main();
