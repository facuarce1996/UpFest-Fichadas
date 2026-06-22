import { supabase } from './services/supabaseClient';
async function run() {
  const { data: buckets } = await supabase.storage.listBuckets();
  console.log("BUCKETS:", buckets?.map(b => b.name));
}
run();
