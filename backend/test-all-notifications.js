/**
 * Test ALL notification types for Admin
 * 
 * Sends each notification type with a 5-second delay between them
 * so you can verify each one appears in the notification tray.
 * 
 * Usage:
 *   1. Install the new APK on your phone
 *   2. Log in as admin
 *   3. CLOSE/KILL the app completely
 *   4. Run: node test-all-notifications.js
 *   5. Watch your notification tray — you should see 8 notifications arrive one by one
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const mongoose = require('mongoose');
const pushNotification = require('./services/pushNotification');

const DELAY_MS = 5000; // 5 seconds between each notification

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('   ALL NOTIFICATION TYPES TEST');
  console.log('═══════════════════════════════════════════════\n');

  // Connect to MongoDB
  console.log('[1] Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('    ✅ Connected\n');

  // Get admin token
  const db = mongoose.connection.db;
  const users = await db.collection('users').find({ pushToken: { $ne: null } }).toArray();
  
  const adminTokens = users.filter(u => u.pushToken).map(u => ({
    name: u.name || 'Admin',
    token: u.pushToken
  }));

  if (adminTokens.length === 0) {
    console.log('❌ No admin with push token found. Log in on the app first.');
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`[2] Found ${adminTokens.length} admin(s) with push tokens:\n`);
  adminTokens.forEach(a => {
    console.log(`    👤 ${a.name} | ${a.token.substring(0, 40)}...`);
  });

  const token = adminTokens[0].token;
  console.log(`\n[3] Sending all notification types to: ${adminTokens[0].name}\n`);
  console.log(`    ⏱️  ${DELAY_MS / 1000}s delay between each notification\n`);
  console.log('───────────────────────────────────────────────\n');

  const orderId = 'TEST-' + Date.now().toString(36).toUpperCase();
  let count = 0;
  let success = 0;

  // ── Notification 1: New COD Delivery Order ────────────────────
  count++;
  console.log(`  [${count}/8] 🎉 New COD Delivery Order...`);
  try {
    const result = await pushNotification.sendAdminNewOrderNotification(token, {
      orderId: orderId + '-COD',
      totalAmount: 450,
      customerName: 'Ravi Kumar',
      items: [{ name: 'Chicken Biryani', qty: 2 }, { name: 'Butter Naan', qty: 4 }]
    });
    console.log(`         ${result ? '✅ SENT' : '❌ FAILED'}`);
    if (result) success++;
  } catch (e) { console.log(`         ❌ ERROR: ${e.message}`); }
  
  await sleep(DELAY_MS);

  // ── Notification 2: New Pickup Order ──────────────────────────
  count++;
  console.log(`  [${count}/8] 🎉 New Pickup Order...`);
  try {
    const result = await pushNotification.sendAdminNewOrderNotification(token, {
      orderId: orderId + '-PICK',
      totalAmount: 280,
      customerName: 'Priya Sharma',
      items: [{ name: 'Paneer Tikka', qty: 1 }, { name: 'Dal Makhani', qty: 1 }]
    });
    console.log(`         ${result ? '✅ SENT' : '❌ FAILED'}`);
    if (result) success++;
  } catch (e) { console.log(`         ❌ ERROR: ${e.message}`); }
  
  await sleep(DELAY_MS);

  // ── Notification 3: UPI Payment Confirmed ─────────────────────
  count++;
  console.log(`  [${count}/8] 💳 UPI Payment Confirmed...`);
  try {
    const result = await pushNotification.sendNotification(
      token,
      '💳 Payment Confirmed!',
      `Order #${orderId}-UPI - ₹650\nArun Patel paid via UPI`,
      { type: 'payment_confirmed', orderId: orderId + '-UPI', screen: 'Orders' },
      'order-updates'
    );
    console.log(`         ${result ? '✅ SENT' : '❌ FAILED'}`);
    if (result) success++;
  } catch (e) { console.log(`         ❌ ERROR: ${e.message}`); }
  
  await sleep(DELAY_MS);

  // ── Notification 4: Order Confirmed (status change) ───────────
  count++;
  console.log(`  [${count}/8] ✅ Order Status → Confirmed...`);
  try {
    const result = await pushNotification.sendNotification(
      token,
      '✅ Order Confirmed',
      `Order #${orderId}-COD - ₹450\nStatus: Confirmed`,
      { type: 'order_status', orderId: orderId + '-COD', status: 'confirmed', screen: 'Orders' },
      'order-updates'
    );
    console.log(`         ${result ? '✅ SENT' : '❌ FAILED'}`);
    if (result) success++;
  } catch (e) { console.log(`         ❌ ERROR: ${e.message}`); }
  
  await sleep(DELAY_MS);

  // ── Notification 5: Order Preparing ───────────────────────────
  count++;
  console.log(`  [${count}/8] 👨‍🍳 Order Status → Preparing...`);
  try {
    const result = await pushNotification.sendNotification(
      token,
      '👨‍🍳 Order Preparing',
      `Order #${orderId}-COD - ₹450\nStatus: Preparing`,
      { type: 'order_status', orderId: orderId + '-COD', status: 'preparing', screen: 'Orders' },
      'order-updates'
    );
    console.log(`         ${result ? '✅ SENT' : '❌ FAILED'}`);
    if (result) success++;
  } catch (e) { console.log(`         ❌ ERROR: ${e.message}`); }
  
  await sleep(DELAY_MS);

  // ── Notification 6: Customer Cancelled Order ──────────────────
  count++;
  console.log(`  [${count}/8] ❌ Customer Cancelled Order...`);
  try {
    const result = await pushNotification.sendNotification(
      token,
      '❌ Order Cancelled by Customer',
      `Order #${orderId}-PICK - ₹280\nPriya Sharma cancelled via WhatsApp`,
      { type: 'order_cancelled', orderId: orderId + '-PICK', screen: 'Orders' },
      'order-updates'
    );
    console.log(`         ${result ? '✅ SENT' : '❌ FAILED'}`);
    if (result) success++;
  } catch (e) { console.log(`         ❌ ERROR: ${e.message}`); }
  
  await sleep(DELAY_MS);

  // ── Notification 7: Auto-Cancel (Payment Timeout) ────────────
  count++;
  console.log(`  [${count}/8] ⏰ Order Auto-Cancelled (timeout)...`);
  try {
    const result = await pushNotification.sendNotification(
      token,
      '⏰ Order Auto-Cancelled',
      `Order #${orderId}-UPI - ₹650\nPayment not received within 15 min`,
      { type: 'order_cancelled', orderId: orderId + '-UPI', screen: 'Orders' },
      'order-updates'
    );
    console.log(`         ${result ? '✅ SENT' : '❌ FAILED'}`);
    if (result) success++;
  } catch (e) { console.log(`         ❌ ERROR: ${e.message}`); }
  
  await sleep(DELAY_MS);

  // ── Notification 8: Refund Requested ──────────────────────────
  count++;
  console.log(`  [${count}/8] 💰 Refund Requested...`);
  try {
    const result = await pushNotification.sendNotification(
      token,
      '💰 Refund Requested',
      `Order #${orderId}-UPI - ₹650\nCustomer requested a refund`,
      { type: 'refund_requested', orderId: orderId + '-UPI', screen: 'Orders' },
      'order-updates'
    );
    console.log(`         ${result ? '✅ SENT' : '❌ FAILED'}`);
    if (result) success++;
  } catch (e) { console.log(`         ❌ ERROR: ${e.message}`); }

  // ── Summary ───────────────────────────────────────────────────
  console.log('\n───────────────────────────────────────────────');
  console.log(`\n  📊 Results: ${success}/${count} notifications sent successfully\n`);
  console.log('═══════════════════════════════════════════════');
  console.log('  CHECK YOUR PHONE NOTIFICATION TRAY!');
  console.log('  You should see these 8 notifications:');
  console.log('');
  console.log('  1. 🎉 New Order Received! (COD delivery)');
  console.log('  2. 🎉 New Order Received! (Pickup)');
  console.log('  3. 💳 Payment Confirmed!');
  console.log('  4. ✅ Order Confirmed');
  console.log('  5. 👨‍🍳 Order Preparing');
  console.log('  6. ❌ Order Cancelled by Customer');
  console.log('  7. ⏰ Order Auto-Cancelled');
  console.log('  8. 💰 Refund Requested');
  console.log('═══════════════════════════════════════════════\n');

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
