import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wexmtqqrvlnugqshvdwc.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndleG10cXFydmxudWdxc2h2ZHdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwNTAwMzUsImV4cCI6MjA5MjYyNjAzNX0.DXNxVeMG9uXAdhFdTmG_U5BNjbgVLJK_irBlTlWI7ZI';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function check() {
  console.log("Checking users table...");
  const { data, error } = await supabase.from('users').select('id, name').limit(1);
  if (error) {
    console.error("Error querying users:", error);
  } else {
    console.log("Users returned:", data);
  }
}

check();
