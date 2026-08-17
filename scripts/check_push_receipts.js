import fs from 'fs';

const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const TICKETS_FILE = 'push_tickets.json';

async function checkPushReceipts() {
  if (!fs.existsSync(TICKETS_FILE)) {
    console.log(`No ${TICKETS_FILE} found. You must run a notification script first that saves ticket IDs.`);
    return;
  }

  let tickets;
  try {
    tickets = JSON.parse(fs.readFileSync(TICKETS_FILE, 'utf8'));
  } catch (e) {
    console.error(`Error reading ${TICKETS_FILE}:`, e.message);
    return;
  }

  const ticketIds = Object.keys(tickets);
  if (ticketIds.length === 0) {
    console.log('No tickets found in the file.');
    return;
  }

  console.log(`Found ${ticketIds.length} ticket(s) to check.`);

  try {
    // Expo allows checking up to 1000 receipts at once. If we have more, we should chunk,
    // but for now this is fine.
    const response = await fetch(EXPO_RECEIPTS_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ids: ticketIds }),
    });

    const result = await response.json();

    if (result.errors) {
      console.error('Error fetching receipts:', result.errors);
      return;
    }

    const receipts = result.data;
    let delivered = 0;
    let failed = 0;
    let pending = 0;

    console.log('\n--- Push Notification Delivery Status ---');
    
    for (const [id, ticketInfo] of Object.entries(tickets)) {
      const receipt = receipts[id];
      const userStr = `${ticketInfo.userName} (sent at ${new Date(ticketInfo.sentAt).toLocaleString()})`;

      if (!receipt) {
        // If not in receipts, it's still pending (Expo hasn't processed it or the ticket ID is too old)
        console.log(`[PENDING] ${userStr}`);
        pending++;
      } else if (receipt.status === 'ok') {
        console.log(`[DELIVERED] ${userStr}`);
        delivered++;
      } else if (receipt.status === 'error') {
        console.log(`[ERROR] ${userStr} - ${receipt.message} (${receipt.details?.error || 'No details'})`);
        failed++;
      }
    }

    console.log('\n--- Summary ---');
    console.log(`Delivered: ${delivered}`);
    console.log(`Failed: ${failed}`);
    console.log(`Pending: ${pending}`);
    console.log('---------------\n');
    
    // Optionally clean up tickets that are no longer pending
    // We'll leave them for now so you have a log.

  } catch (e) {
    console.error('Error checking receipts:', e.message);
  }
}

checkPushReceipts();
