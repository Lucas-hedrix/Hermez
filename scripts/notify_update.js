import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const SUPABASE_URL = 'https://wexmtqqrvlnugqshvdwc.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndleG10cXFydmxudWdxc2h2ZHdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwNTAwMzUsImV4cCI6MjA5MjYyNjAzNX0.DXNxVeMG9uXAdhFdTmG_U5BNjbgVLJK_irBlTlWI7ZI';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function notifyAllUsersOfUpdate() {
  console.log('Fetching push tokens for all users...');
  
  // Get all users who have a push_token registered
  const { data: users, error } = await supabase
    .from('users')
    .select('id, name, push_token')
    .not('push_token', 'is', null);

  if (error) {
    console.error('Error fetching users:', error);
    return;
  }

  if (!users || users.length === 0) {
    console.log('No users with push tokens found.');
    return;
  }

  console.log(`Found ${users.length} users with push tokens. Sending notifications...`);

  // Expo Push API endpoint
  const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
  
  let successCount = 0;
  let failCount = 0;
  const tickets = {};

  for (const user of users) {
    const payload = {
      to: user.push_token,
      sound: 'default',
      title: 'Hermez Is Cooking ... ',
      body: "New version Just Dropped, Check it out on our website ",
      data: { type: 'system_update' },
    };

    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      
      // Expo API returns an array in data even if we sent a single object, or an object if there's an error.
      const data = Array.isArray(result.data) ? result.data[0] : result.data;

      if (data?.status === 'ok') {
        successCount++;
        // Save the ticket ID to check the receipt later
        if (data.id) {
          tickets[data.id] = { userName: user.name, pushToken: user.push_token, sentAt: new Date().toISOString() };
        }
      } else {
        failCount++;
        console.error(`Failed to send to ${user.name}:`, data?.message || data?.details || 'Unknown error');
      }
    } catch (e) {
      failCount++;
      console.error(`Error sending to ${user.name}:`, e.message);
    }
  }

  // Save the tickets to a local file
  if (Object.keys(tickets).length > 0) {
    import('fs').then(fs => {
      let existingTickets = {};
      try {
        if (fs.existsSync('push_tickets.json')) {
          existingTickets = JSON.parse(fs.readFileSync('push_tickets.json', 'utf8'));
        }
      } catch (e) {
        console.error('Error reading existing tickets file:', e.message);
      }
      
      const mergedTickets = { ...existingTickets, ...tickets };
      fs.writeFileSync('push_tickets.json', JSON.stringify(mergedTickets, null, 2));
      console.log(`\nSaved ${Object.keys(tickets).length} push ticket(s) to push_tickets.json`);
      console.log(`You can now run 'node scripts/check_push_receipts.js' to check if they were delivered.`);
    });
  }

  console.log('\n--- Update Notification Summary ---');
  console.log(`Successfully sent to Expo: ${successCount}`);
  console.log(`Failed to send to Expo: ${failCount}`);
  console.log('Done!');
}

notifyAllUsersOfUpdate();
