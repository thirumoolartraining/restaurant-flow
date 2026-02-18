/**
 * Test background/killed-state push notification
 * 
 * Usage: node test-bg-push.js
 * 
 * BEFORE running:
 * 1. Install the NEW APK (with background display fix)
 * 2. Log in on the device
 * 3. CLOSE/KILL the app completely
 * 4. Run this script
 * 5. Check if notification appears in the notification tray
 */

require('dotenv').config();
const mongoose = require('mongoose');
const pushNotification = require('./services/pushNotification');

async function main() {
  console.log('============================================');
  console.log('   BACKGROUND/KILLED PUSH TEST');
  console.log('============================================\n');

  // Connect to MongoDB
  console.log('[1] Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('    ✅ Connected\n');

  // Get all tokens
  const db = mongoose.connection.db;
  const users = await db.collection('users').find({}).toArray();
  const deliveryBoys = await db.collection('deliveryboys').find({}).toArray();

  const targets = [];
  users.forEach(u => {
    if (u.pushToken && typeof u.pushToken === 'string') {
      targets.push({ name: u.name || 'Admin', role: u.role, token: u.pushToken });
    }
  });
  deliveryBoys.forEach(d => {
    if (d.pushToken && typeof d.pushToken === 'string') {
      targets.push({ name: d.name, role: 'delivery', token: d.pushToken });
    }
  });

  // Deduplicate by token (same device = same token)
  const uniqueTokens = new Map();
  targets.forEach(t => {
    if (!uniqueTokens.has(t.token)) uniqueTokens.set(t.token, t);
  });

  console.log(`[2] Found ${uniqueTokens.size} unique device(s):\n`);
  for (const [token, t] of uniqueTokens) {
    const type = token.startsWith('ExponentPushToken') ? 'EXPO' : 'FCM';
    console.log(`    ${type} | ${t.name} (${t.role}) | ${token.substring(0, 40)}...`);
  }

  console.log('\n[3] Sending background test notifications...\n');

  for (const [token, t] of uniqueTokens) {
    const type = token.startsWith('ExponentPushToken') ? 'EXPO' : 'FCM';
    console.log(`    → ${t.name} (${type})`);

    try {
      // Simulate a real "new order" notification (same as business flow)
      const result = await pushNotification.sendNewOrderNotification(token, {
        orderId: 'BG-TEST-' + Date.now().toString(36).toUpperCase(),
        totalAmount: 350,
        customerName: 'Background Test Customer',
        deliveryAddress: '123 Test Street, Chennai',
        items: [{ name: 'Chicken Biryani', qty: 2 }],
      });

      if (result) {
        console.log(`      ✅ SENT! Result: ${JSON.stringify(result)}`);
      } else {
        console.log(`      ❌ FAILED (returned false)`);
      }
    } catch (err) {
      console.log(`      ❌ ERROR: ${err.message}`);
    }
  }

  console.log('\n============================================');
  console.log('   CHECK YOUR DEVICE NOTIFICATION TRAY!');
  console.log('   You should see: "🛵 New Order Assigned!"');
  console.log('============================================\n');

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
