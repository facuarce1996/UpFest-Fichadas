import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data } = await supabase.from('users').select('name, reference_image').limit(20);
  for (const u of data||[]) {
    const val = u.reference_image;
    let type = typeof val;
    let info = "";
    if (!val) {
      info = "null/empty";
    } else if (val.startsWith('http')) {
      info = "URL => " + val.substring(0, 50) + "...";
    } else if (val.startsWith('data:image')) {
      info = "Base64 (length: " + val.length + ")";
    } else {
      info = "String (length: " + val.length + "): " + val.substring(0, 50);
    }
    console.log(u.name, "=>", info);
  }
}
main();
