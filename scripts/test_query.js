const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://wexmtqqrvlnugqshvdwc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndleG10cXFydmxudWdxc2h2ZHdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwNTAwMzUsImV4cCI6MjA5MjYyNjAzNX0.DXNxVeMG9uXAdhFdTmG_U5BNjbgVLJK_irBlTlWI7ZI';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
async function run() {
  const { data, error } = await supabase
    .from('users')
    .select('dating_enabled');

  const datingCount = data.filter(u => u.dating_enabled).length;
  console.log('Users with dating_enabled = true:', datingCount);
}
run();
