/**
 * One-time script to sync current database stats to Google Sheets dashboard_stats
 * Run this to update the sheet with current values
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Order = require('./models/Order');
const Customer = require('./models/Customer');
const googleSheets = require('./services/googleSheets');

async function syncDashboardStats() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Get current date for today's stats
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    console.log('\n📊 Calculating stats from database...');

    // Calculate Total Orders
    const totalOrders = await Order.countDocuments();
    console.log(`Total Orders: ${totalOrders}`);

    // Calculate Total Revenue
    const totalRevenueResult = await Order.aggregate([
      { $match: { paymentStatus: { $in: ['paid', 'pending'] } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);
    const totalRevenue = totalRevenueResult[0]?.total || 0;
    console.log(`Total Revenue: ₹${totalRevenue}`);

    // Calculate Total Customers
    const totalCustomers = await Customer.countDocuments();
    console.log(`Total Customers: ${totalCustomers}`);

    // Calculate Today Orders
    const todayOrders = await Order.countDocuments({
      createdAt: { $gte: todayStart, $lte: todayEnd }
    });
    console.log(`Today Orders: ${todayOrders}`);

    // Calculate Today Revenue
    const todayRevenueResult = await Order.aggregate([
      { 
        $match: { 
          createdAt: { $gte: todayStart, $lte: todayEnd },
          paymentStatus: { $in: ['paid', 'pending'] }
        } 
      },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);
    const todayRevenue = todayRevenueResult[0]?.total || 0;
    console.log(`Today Revenue: ₹${todayRevenue}`);

    // Format today's date
    const todayDate = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
    console.log(`Today Date: ${todayDate}`);

    console.log('\n📤 Updating Google Sheets...');

    // Update each stat in Google Sheets
    await googleSheets.updateDashboardStat('Total Orders', totalOrders);
    console.log('✅ Updated Total Orders');

    await googleSheets.updateDashboardStat('Total Revenue', totalRevenue);
    console.log('✅ Updated Total Revenue');

    await googleSheets.updateDashboardStat('Total Customers', totalCustomers);
    console.log('✅ Updated Total Customers');

    await googleSheets.updateDashboardStat('Today Orders', todayOrders);
    console.log('✅ Updated Today Orders');

    await googleSheets.updateDashboardStat('Today Revenue', todayRevenue);
    console.log('✅ Updated Today Revenue');

    await googleSheets.updateDashboardStat('Today Date', todayDate);
    console.log('✅ Updated Today Date');

    console.log('\n🎉 Dashboard stats synced successfully!');
    console.log('\n📊 Summary:');
    console.log(`   Total Orders: ${totalOrders}`);
    console.log(`   Total Revenue: ₹${totalRevenue}`);
    console.log(`   Total Customers: ${totalCustomers}`);
    console.log(`   Today Orders: ${todayOrders}`);
    console.log(`   Today Revenue: ₹${todayRevenue}`);
    console.log(`   Today Date: ${todayDate}`);

    await mongoose.connection.close();
    console.log('\n✅ MongoDB connection closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error syncing dashboard stats:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run the sync
syncDashboardStats();
