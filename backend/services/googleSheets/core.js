const { google } = require('googleapis');
const logger = require('../logger');

// Google Sheets configuration
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME || 'Sheet1';

// Sheet names for different order statuses
const SHEET_NAMES = {
  new: 'neworders',
  delivered: 'delivered',
  cancelled: 'cancelled',
  selfpick: 'selfpick',
  customers: 'customers',
  daily_reports: 'daily_reports',
  dashboard_stats: 'dashboard_stats'
};

// Customer cache for performance (avoids repeated slow Google Sheets API calls)
let customerCache = {
  data: null,
  timestamp: 0,
  TTL: 60000 // Cache for 60 seconds
};

// Status colors (RGB values 0-1)
const STATUS_COLORS = {
  pending: { red: 1, green: 0.95, blue: 0.8 },
  confirmed: { red: 0.85, green: 0.92, blue: 1 },
  preparing: { red: 1, green: 0.9, blue: 0.8 },
  ready: { red: 0.9, green: 0.85, blue: 1 },
  out_for_delivery: { red: 0.85, green: 0.88, blue: 1 },
  delivered: { red: 0.85, green: 1, blue: 0.85 },
  cancelled: { red: 1, green: 0.85, blue: 0.85 },
  selfpick: { red: 0.9, green: 0.95, blue: 1 },
  ready_for_pickup: { red: 0.85, green: 0.9, blue: 1 },
  picked_up: { red: 0.8, green: 1, blue: 0.9 }
};

// Status display labels
const STATUS_LABELS = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready: 'Ready',
  out_for_delivery: 'On the Way',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  selfpick: 'Self Pickup',
  ready_for_pickup: 'Ready for Pickup',
  picked_up: 'Completed',
  completed: 'Completed'
};

// Helper function to format date as dd/mm/yyyy
const formatDateDDMMYYYY = (date = new Date()) => {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

// Helper function to format date and time as dd/mm/yyyy hh:mm:ss
const formatDateTimeDDMMYYYY = (date = new Date()) => {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
};

// Initialize Google Sheets API with Service Account
const getAuthClient = () => {
  try {
    const keyData = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!keyData) {
      logger.error('❌ GOOGLE_SERVICE_ACCOUNT_KEY not set');
      return null;
    }
    const credentials = JSON.parse(keyData);
    return new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
  } catch (error) {
    logger.error('❌ Error parsing Google credentials:', error.message);
    return null;
  }
};

const googleSheets = {
  // Get sheet info by type
  async getSheetByType(sheets, sheetType) {
    try {
      const sheetName = SHEET_NAMES[sheetType];
      if (!sheetName) return null;
      
      const response = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
      const sheet = response.data.sheets.find(s => 
        s.properties.title.toLowerCase() === sheetName.toLowerCase()
      );
      
      return sheet ? { sheetId: sheet.properties.sheetId, sheetName: sheet.properties.title } : null;
    } catch (error) {
      logger.error('Error getting sheet:', error.message);
      return null;
    }
  },

  // Find order in a sheet
  async findOrderInSheet(sheets, sheetName, orderId) {
    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A:M`
      });
      
      const rows = response.data.values || [];
      const rowIndex = rows.findIndex(row => row[0] === orderId);
      
      return rowIndex === -1 ? null : { rowIndex, rowData: rows[rowIndex] };
    } catch (error) {
      logger.error(`Error finding order in ${sheetName}:`, error.message);
      return null;
    }
  },

  // Add date header to sheet
  async addDateHeader(sheets, sheetName, sheetId) {
    try {
      const istOptions = { timeZone: 'Asia/Kolkata' };
      const date = new Date();
      const dateStr = date.toLocaleDateString('en-IN', istOptions);
      const dayName = date.toLocaleDateString('en-IN', { ...istOptions, weekday: 'long' });
      const year = date.toLocaleDateString('en-IN', { ...istOptions, year: 'numeric' });
      const dateHeaderText = `📅 ${dayName}, ${dateStr} (${year})`;

      // Check if header exists
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A:A`
      });
      
      const rows = response.data.values || [];
      if (rows.some(row => row[0] && row[0].includes(dateStr))) return;

      // Add header (13 columns now)
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A:M`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: { values: [[dateHeaderText, '', '', '', '', '', '', '', '', '', '', '', '']] }
      });

      // Style header
      const getResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A:A`
      });
      const headerRowIndex = (getResponse.data.values || []).findIndex(row => row[0] === dateHeaderText);
      
      if (headerRowIndex !== -1) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          resource: {
            requests: [
              {
                repeatCell: {
                  range: { sheetId, startRowIndex: headerRowIndex, endRowIndex: headerRowIndex + 1, startColumnIndex: 0, endColumnIndex: 13 },
                  cell: {
                    userEnteredFormat: {
                      backgroundColor: { red: 0.2, green: 0.4, blue: 0.6 },
                      textFormat: { bold: true, fontSize: 12, foregroundColor: { red: 1, green: 1, blue: 1 } },
                      horizontalAlignment: 'CENTER'
                    }
                  },
                  fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
                }
              },
              {
                mergeCells: {
                  range: { sheetId, startRowIndex: headerRowIndex, endRowIndex: headerRowIndex + 1, startColumnIndex: 0, endColumnIndex: 13 },
                  mergeType: 'MERGE_ALL'
                }
              }
            ]
          }
        });
      }
    } catch (error) {
      logger.error('Error adding date header:', error.message);
    }
  },

  // Update row color
  async updateRowColor(sheets, sheetId, rowIndex, status) {
    try {
      const color = STATUS_COLORS[status] || STATUS_COLORS.pending;
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        resource: {
          requests: [{
            repeatCell: {
              range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: 0, endColumnIndex: 13 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: color,
                  textFormat: { foregroundColor: { red: 0, green: 0, blue: 0 } }
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat.foregroundColor)'
            }
          }]
        }
      });
    } catch (error) {
      logger.error('Error updating row color:', error.message);
    }
  },

  // Add order to a specific sheet (with duplicate check)
  async addOrderToSheet(sheets, sheetType, rowData, paymentStatus, orderStatus, colorStatus) {
    try {
      const sheet = await this.getSheetByType(sheets, sheetType);
      if (!sheet) return false;

      const orderId = rowData[0];
      
      // Check if order already exists in this sheet
      const existingOrder = await this.findOrderInSheet(sheets, sheet.sheetName, orderId);
      if (existingOrder) {
        logger.info(`⏭️ Order ${orderId} already exists in ${sheet.sheetName}, skipping add`);
        return true; // Return true since order is already there
      }

      await this.addDateHeader(sheets, sheet.sheetName, sheet.sheetId);

      // Normalize row data to 13-column structure
      // Detect if data is in old 11-column format by checking if column 7 contains status text
      const col7 = (rowData[7] || '').toString();
      const isOldFormat = col7.includes('Pending') || col7.includes('Paid') || col7.includes('Ready') || 
                          col7.includes('Confirmed') || col7.includes('Preparing');
      
      let newRowData;
      if (isOldFormat && rowData.length <= 11) {
        // Old 11-column format: OrderID, Time, Phone, Name, Items, Total, PaymentMethod, PaymentStatus, OrderStatus, Address, DeliveryPartner
        // Convert to 13-column: OrderID, Time, Phone, Name, Items, ItemsTotal, Delivery, Total, PaymentMethod, PaymentStatus, OrderStatus, Address, DeliveryPartner
        const itemsTotal = parseFloat(rowData[5]) || 0;
        newRowData = [
          rowData[0],  // OrderID
          rowData[1],  // Time
          rowData[2],  // Phone
          rowData[3],  // Name
          rowData[4],  // Items
          itemsTotal,  // ItemsTotal
          0,           // Delivery
          itemsTotal,  // Total (same as items total for pickup)
          rowData[6] || '',  // PaymentMethod
          '',          // PaymentStatus (will be set below)
          '',          // OrderStatus (will be set below)
          rowData[9] || 'Self Pickup',  // Address
          rowData[10] || ''  // DeliveryPartner
        ];
      } else {
        // Already 13-column format or close to it
        newRowData = [...rowData];
        while (newRowData.length < 13) newRowData.push('');
      }
      
      // Ensure Total column (7) has numeric value, not status text
      if (isNaN(parseFloat(newRowData[7])) || newRowData[7].toString().includes('Pending') || newRowData[7].toString().includes('Ready')) {
        newRowData[7] = newRowData[5] || 0; // Use ItemsTotal
      }
      
      // Set payment status at correct index (9)
      newRowData[9] = STATUS_LABELS[paymentStatus] || paymentStatus;
      // Set order status at correct index (10)
      newRowData[10] = STATUS_LABELS[orderStatus] || orderStatus;

      // Add row
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheet.sheetName}!A:M`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: { values: [newRowData] }
      });

      // Apply color
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheet.sheetName}!A:A`
      });
      const rows = response.data.values || [];
      const newRowIndex = rows.findIndex(row => row[0] === newRowData[0]);
      if (newRowIndex !== -1) {
        await this.updateRowColor(sheets, sheet.sheetId, newRowIndex, colorStatus);
      }

      logger.info(`✅ Order added to ${sheet.sheetName}:`, newRowData[0]);
      return true;
    } catch (error) {
      logger.error(`Error adding order to ${sheetType}:`, error.message);
      return false;
    }
  },

  // Delete order from a sheet
  async deleteOrderFromSheet(sheets, sheetId, rowIndex) {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        resource: {
          requests: [{
            deleteDimension: {
              range: { sheetId, dimension: 'ROWS', startIndex: rowIndex, endIndex: rowIndex + 1 }
            }
          }]
        }
      });
      return true;
    } catch (error) {
      logger.error('Error deleting row:', error.message);
      return false;
    }
  },

  // Add new order to neworders sheet (both delivery and self-pickup)
  async addOrder(order) {
    try {
      const auth = getAuthClient();
      if (!auth) return false;
      
      const sheets = google.sheets({ version: 'v4', auth });
      
      // All orders go to neworders sheet (both delivery and pickup)
      const sheet = await this.getSheetByType(sheets, 'new');
      if (!sheet) return false;

      await this.addDateHeader(sheets, sheet.sheetName, sheet.sheetId);

      const date = new Date(order.createdAt || Date.now());
      const istOptions = { timeZone: 'Asia/Kolkata' };
      const itemsStr = order.items.map(item => `${item.name} x${item.quantity} (₹${item.price * item.quantity})`).join(', ');

      // Get delivery address for logging
      const deliveryAddress = order.serviceType === 'pickup' ? 'Self Pickup' : (order.deliveryAddress?.address || '');
      logger.info(`📊 Adding order ${order.orderId} to sheets - Address: "${deliveryAddress}"`);

      // Determine payment method label based on service type
      let paymentMethodLabel = 'UPI/App';
      if (order.paymentMethod === 'cod') {
        if (order.serviceType === 'pickup') {
          paymentMethodLabel = 'Pay at Hotel';
        } else {
          paymentMethodLabel = 'COD';
        }
      }

      // Determine payment status label
      let paymentStatusLabel = 'Pending';
      if (order.paymentStatus === 'paid') {
        paymentStatusLabel = 'Paid';
      } else if (order.paymentMethod === 'cod') {
        if (order.serviceType === 'pickup') {
          paymentStatusLabel = 'Pay at Hotel';
        } else {
          paymentStatusLabel = 'Pending';
        }
      }

      // New column structure: OrderID, Time, Phone, Name, Items, ItemsTotal, DeliveryCharge, Total, PaymentMethod, PaymentStatus, OrderStatus, Address, DeliveryPartner
      const itemsTotal = order.itemsTotal || order.totalAmount;
      const deliveryCharge = order.deliveryCharge || 0;
      
      const row = [
        order.orderId,
        date.toLocaleTimeString('en-IN', istOptions),
        order.customer?.phone || '',
        order.customer?.name || '',
        itemsStr,
        itemsTotal,
        deliveryCharge,
        order.totalAmount,
        paymentMethodLabel,
        paymentStatusLabel,
        STATUS_LABELS[order.status] || order.status || 'Pending',
        order.serviceType === 'pickup' ? 'Self Pickup' : (order.deliveryAddress?.address || ''),
        '' // Delivery Partner (empty for pickup, or delivery partner name for delivery)
      ];

      const response = await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheet.sheetName}!A:M`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: { values: [row] }
      });

      const updatedRange = response.data.updates?.updatedRange;
      if (updatedRange) {
        const match = updatedRange.match(/!A(\d+):/);
        if (match) {
          // Use selfpick color for pickup orders, otherwise use order status color
          const colorStatus = order.serviceType === 'pickup' ? 'selfpick' : (order.status || 'pending');
          await this.updateRowColor(sheets, sheet.sheetId, parseInt(match[1]) - 1, colorStatus);
        }
      }

      logger.info(`✅ Order added to Google Sheet (${sheet.sheetName}):`, order.orderId);
      return true;
    } catch (error) {
      logger.error('❌ Google Sheets add order error:', error.message);
      return false;
    }
  },

  // Main function to update order status
  async updateOrderStatus(orderId, status, paymentStatus = null, actualPaymentMethod = null) {
    try {
      logger.info('📊 updateOrderStatus:', { orderId, status, paymentStatus, actualPaymentMethod });
      
      const auth = getAuthClient();
      if (!auth) return false;
      
      const sheets = google.sheets({ version: 'v4', auth });

      // Handle delivered/completed orders - move from neworders to appropriate sheet
      if (status === 'delivered' || status === 'picked_up') {
        const newSheet = await this.getSheetByType(sheets, 'new');
        if (!newSheet) return false;
        
        const orderData = await this.findOrderInSheet(sheets, newSheet.sheetName, orderId);
        if (!orderData) {
          logger.info('❌ Order not found in neworders sheet');
          return false;
        }

        // 13-column structure: A=OrderID(0), B=Time(1), C=Phone(2), D=Name(3), E=Items(4), F=ItemsTotal(5), 
        // G=Delivery(6), H=Total(7), I=PaymentMethod(8), J=PaymentStatus(9), K=OrderStatus(10), L=Address(11), M=DeliveryPartner(12)
        
        // Check if this is a pickup order by looking at address column (index 11) or order ID prefix
        const addressCol = (orderData.rowData[11] || '').toString();
        const isPickupOrder = addressCol === 'Self Pickup' || orderId.startsWith('S');
        
        // Get original payment method from column I (index 8)
        const originalPaymentMethod = (orderData.rowData[8] || '').toString().toLowerCase();
        const isPrepaidOnline = originalPaymentMethod.includes('upi') || originalPaymentMethod === 'paid' || 
                                originalPaymentMethod === 'online' || originalPaymentMethod === 'upi/app';
        const isPayAtHotel = originalPaymentMethod.includes('pay at hotel') || originalPaymentMethod.includes('cod') || 
                            originalPaymentMethod === 'cash';
        
        // Determine final Payment Method (column I) and Payment Status (column J)
        let finalPaymentMethod = orderData.rowData[8];
        let finalPaymentStatus = paymentStatus || 'paid';
        
        if (isPickupOrder) {
          if (isPrepaidOnline) {
            // Pre-paid online order: Payment Method = "UPI/App", Payment Status = "Paid"
            finalPaymentMethod = 'UPI/App';
            finalPaymentStatus = 'Paid';
          } else if (isPayAtHotel || actualPaymentMethod) {
            // Pay at Hotel order: Payment Method = "Pay at Hotel", Payment Status = "Paid (Cash)" or "Paid (UPI)"
            finalPaymentMethod = 'Pay at Hotel';
            if (actualPaymentMethod) {
              finalPaymentStatus = actualPaymentMethod === 'cash' ? 'Paid (Cash)' : 'Paid (UPI)';
            } else {
              finalPaymentStatus = 'Paid (Cash)'; // Default to cash if not specified
            }
          }
          // Update the rowData with correct values
          orderData.rowData[8] = finalPaymentMethod;
        }
        
        if (isPickupOrder) {
          // Pickup orders go to selfpick sheet when completed
          logger.info('📦 Moving completed pickup order to selfpick sheet:', orderId, 'Method:', finalPaymentMethod, 'Status:', finalPaymentStatus);
          await this.addOrderToSheet(sheets, 'selfpick', orderData.rowData, finalPaymentStatus, 'picked_up', 'picked_up');
        } else {
          // Delivery orders go to delivered sheet
          // For COD delivery orders, determine payment status based on actual payment method
          const isCodDelivery = originalPaymentMethod.includes('cod') || originalPaymentMethod === 'cash';
          if (isCodDelivery && actualPaymentMethod) {
            finalPaymentStatus = actualPaymentMethod === 'cash' ? 'Paid (Cash)' : 'Paid (UPI)';
          } else if (isPrepaidOnline) {
            finalPaymentStatus = 'Paid';
          }
          logger.info('🚚 Moving completed delivery order to delivered sheet:', orderId, 'Status:', finalPaymentStatus);
          await this.addOrderToSheet(sheets, 'delivered', orderData.rowData, finalPaymentStatus, 'delivered', 'delivered');
        }
        
        // Delete from neworders
        await this.deleteOrderFromSheet(sheets, newSheet.sheetId, orderData.rowIndex);
        return true;
      }

      // Handle cancelled orders - just move to cancelled sheet (no refund logic)
      if (status === 'cancelled') {
        const newSheet = await this.getSheetByType(sheets, 'new');
        let orderData = null;
        
        if (newSheet) {
          orderData = await this.findOrderInSheet(sheets, newSheet.sheetName, orderId);
        }
        
        if (!orderData) {
          logger.info('⚠️ Order not found in neworders sheet, trying to fetch from database...');
          // Try to get order data from database
          try {
            const Order = require('../../models/Order');
            const dbOrder = await Order.findOne({ orderId });
            
            if (dbOrder) {
              const date = new Date(dbOrder.createdAt || Date.now());
              const istOptions = { timeZone: 'Asia/Kolkata' };
              const itemsStr = dbOrder.items.map(item => `${item.name} x${item.quantity} (₹${item.price * item.quantity})`).join(', ');
              
              // Determine payment method label
              let paymentMethodLabel = 'UPI/App';
              if (dbOrder.paymentMethod === 'cod') {
                paymentMethodLabel = dbOrder.serviceType === 'pickup' ? 'Pay at Hotel' : 'COD';
              }
              
              // Use 13-column structure: OrderID, Time, Phone, Name, Items, ItemsTotal, DeliveryCharge, Total, PaymentMethod, PaymentStatus, OrderStatus, Address, DeliveryPartner
              orderData = {
                rowData: [
                  dbOrder.orderId,
                  date.toLocaleTimeString('en-IN', istOptions),
                  dbOrder.customer?.phone || '',
                  dbOrder.customer?.name || '',
                  itemsStr,
                  dbOrder.itemsTotal || dbOrder.totalAmount,
                  dbOrder.deliveryCharge || 0,
                  dbOrder.totalAmount,
                  paymentMethodLabel,
                  STATUS_LABELS[dbOrder.paymentStatus] || 'Pending',
                  'Cancelled',
                  dbOrder.serviceType === 'pickup' ? 'Self Pickup' : (dbOrder.deliveryAddress?.address || ''),
                  dbOrder.deliveryPartnerName || ''
                ],
                rowIndex: -1
              };
              logger.info('✅ Created order data from database for:', orderId);
            }
          } catch (dbErr) {
            logger.error('Error fetching order from database:', dbErr.message);
          }
        }
        
        if (!orderData) {
          logger.info('❌ Order not found in neworders sheet or database');
          return false;
        }

        // Add to cancelled sheet
        await this.addOrderToSheet(sheets, 'cancelled', orderData.rowData, paymentStatus || 'cancelled', 'cancelled', 'cancelled');
        
        // Delete from neworders only if it was found there
        if (newSheet && orderData.rowIndex !== -1) {
          await this.deleteOrderFromSheet(sheets, newSheet.sheetId, orderData.rowIndex);
        }
        return true;
      }

      // Handle refunded orders - REMOVED (no longer needed)
      // Handle refund_failed orders - REMOVED (no longer needed)

      // For other statuses, update in neworders sheet
      const newSheet = await this.getSheetByType(sheets, 'new');
      if (!newSheet) return false;
      
      const orderData = await this.findOrderInSheet(sheets, newSheet.sheetName, orderId);
      if (!orderData) {
        logger.info('❌ Order not found in neworders sheet');
        return false;
      }

      // 13-column structure: A=OrderID, B=Time, C=Phone, D=Name, E=Items, F=ItemsTotal, G=Delivery, 
      // H=Total, I=PaymentMethod, J=PaymentStatus, K=OrderStatus, L=Address, M=DeliveryPartner
      const updates = [];
      if (status) {
        // Order Status is column K (index 10)
        updates.push({ range: `${newSheet.sheetName}!K${orderData.rowIndex + 1}`, values: [[STATUS_LABELS[status] || status]] });
      }
      if (paymentStatus) {
        // Payment Status is column J (index 9)
        updates.push({ range: `${newSheet.sheetName}!J${orderData.rowIndex + 1}`, values: [[STATUS_LABELS[paymentStatus] || paymentStatus]] });
      }

      if (updates.length > 0) {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          resource: { valueInputOption: 'RAW', data: updates }
        });
      }
      await this.updateRowColor(sheets, newSheet.sheetId, orderData.rowIndex, status);
      
      logger.info('✅ Order status updated:', orderId, status);
      return true;
    } catch (error) {
      logger.error('❌ Google Sheets update error:', error.message);
      return false;
    }
  },

  // Initialize sheet with headers
  async initializeSheet() {
    try {
      const auth = getAuthClient();
      const sheets = google.sheets({ version: 'v4', auth });
      
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A1:M1`
      });
      
      if (!response.data.values || response.data.values.length === 0) {
        const headers = ['Order ID', 'Time', 'Customer Phone', 'Customer Name', 'Items', 'Items Total', 'Delivery Charge', 'Total Amount', 'Payment Method', 'Payment Status', 'Order Status', 'Delivery Address', 'Delivery Partner'];
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_NAME}!A1:M1`,
          valueInputOption: 'RAW',
          resource: { values: [headers] }
        });
      }
      return true;
    } catch (error) {
      logger.error('❌ Google Sheets init error:', error.message);
      return false;
    }
  },

  // Update delivery partner name in Google Sheet
  async updateDeliveryPartner(orderId, deliveryPartnerName) {
    try {
      const auth = getAuthClient();
      if (!auth) return false;
      
      const sheets = google.sheets({ version: 'v4', auth });
      const newSheet = await this.getSheetByType(sheets, 'new');
      if (!newSheet) return false;
      
      const orderData = await this.findOrderInSheet(sheets, newSheet.sheetName, orderId);
      if (!orderData) {
        logger.info('❌ Order not found in neworders sheet for delivery partner update');
        return false;
      }
      
      // 13-column structure: DeliveryPartner is column M (index 12)
      // A=OrderID, B=Time, C=Phone, D=Name, E=Items, F=ItemsTotal, G=Delivery, 
      // H=Total, I=PaymentMethod, J=PaymentStatus, K=OrderStatus, L=Address, M=DeliveryPartner
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${newSheet.sheetName}!M${orderData.rowIndex + 1}`,
        valueInputOption: 'RAW',
        resource: { values: [[deliveryPartnerName]] }
      });
      
      logger.info('✅ Delivery partner updated in Google Sheet:', orderId, deliveryPartnerName);
      return true;
    } catch (error) {
      logger.error('❌ Google Sheets delivery partner update error:', error.message);
      return false;
    }
  },

  // Update actual payment method for self-pickup orders (Cash or UPI)
  async updateActualPaymentMethod(orderId, actualPaymentMethod) {
    try {
      const auth = getAuthClient();
      if (!auth) return false;
      
      const sheets = google.sheets({ version: 'v4', auth });
      
      // Try to find in neworders sheet first
      let sheet = await this.getSheetByType(sheets, 'new');
      let orderData = null;
      
      if (sheet) {
        orderData = await this.findOrderInSheet(sheets, sheet.sheetName, orderId);
      }
      
      // If not in neworders, try selfpick sheet (for completed pickup orders)
      if (!orderData) {
        sheet = await this.getSheetByType(sheets, 'selfpick');
        if (sheet) {
          orderData = await this.findOrderInSheet(sheets, sheet.sheetName, orderId);
        }
      }
      
      if (!orderData) {
        logger.info('❌ Order not found in neworders or selfpick sheet for actual payment method update');
        return false;
      }
      
      // Update actual payment method in column K (11th column) - shows "Cash" or "UPI"
      const paymentLabel = actualPaymentMethod === 'cash' ? 'Cash' : 'UPI';
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheet.sheetName}!K${orderData.rowIndex + 1}`,
        valueInputOption: 'RAW',
        resource: { values: [[paymentLabel]] }
      });
      
      // Update payment status to "Paid (Cash)" or "Paid (UPI)"
      const paymentStatusLabel = actualPaymentMethod === 'cash' ? 'Paid (Cash)' : 'Paid (UPI)';
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheet.sheetName}!H${orderData.rowIndex + 1}`,
        valueInputOption: 'RAW',
        resource: { values: [[paymentStatusLabel]] }
      });
      
      logger.info('✅ Actual payment method updated in Google Sheet:', orderId, paymentLabel);
      return true;
    } catch (error) {
      logger.error('❌ Google Sheets actual payment method update error:', error.message);
      return false;
    }
  },

  // Update payment method in Google Sheet (for COD orders showing actual collection method)
  async updatePaymentMethod(orderId, paymentMethodLabel) {
    try {
      const auth = getAuthClient();
      if (!auth) return false;
      
      const sheets = google.sheets({ version: 'v4', auth });
      
      // Try to find in neworders sheet first
      let sheet = await this.getSheetByType(sheets, 'new');
      let orderData = null;
      
      if (sheet) {
        orderData = await this.findOrderInSheet(sheets, sheet.sheetName, orderId);
      }
      
      // If not in neworders, try selfpick sheet
      if (!orderData) {
        sheet = await this.getSheetByType(sheets, 'selfpick');
        if (sheet) {
          orderData = await this.findOrderInSheet(sheets, sheet.sheetName, orderId);
        }
      }
      
      // If not in selfpick, try delivered sheet
      if (!orderData) {
        sheet = await this.getSheetByType(sheets, 'delivered');
        if (sheet) {
          orderData = await this.findOrderInSheet(sheets, sheet.sheetName, orderId);
        }
      }
      
      if (!orderData) {
        logger.info('❌ Order not found for payment method update');
        return false;
      }
      
      // Update payment method in column I (9th column, index 8)
      // 13-column structure: A=OrderID, B=Time, C=Phone, D=Name, E=Items, F=ItemsTotal, 
      // G=Delivery, H=Total, I=PaymentMethod, J=PaymentStatus, K=OrderStatus, L=Address, M=DeliveryPartner
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheet.sheetName}!I${orderData.rowIndex + 1}`,
        valueInputOption: 'RAW',
        resource: { values: [[paymentMethodLabel]] }
      });
      
      logger.info('✅ Payment method updated in Google Sheet:', orderId, paymentMethodLabel);
      return true;
    } catch (error) {
      logger.error('❌ Google Sheets payment method update error:', error.message);
      return false;
    }
  },

  // Fetch order history from Google Sheets (delivered, cancelled, selfpick sheets)
  // This is the cost-saving method - fetches from sheets instead of MongoDB
  // Cache for order history to avoid repeated API calls
  _historyCache: null,
  _historyCacheTime: null,
  _historyCacheDuration: 60000, // Cache for 60 seconds

  async getOrderHistory(options = {}) {
    try {
      const auth = getAuthClient();
      if (!auth) return { orders: [], error: 'Google auth not configured' };
      
      const sheets = google.sheets({ version: 'v4', auth });
      const { deliveryBoyName, startDate, endDate, searchQuery, status, forceRefresh } = options;
      
      let allOrders = [];
      
      // Check cache first (only for non-filtered requests or if cache is still valid)
      const now = Date.now();
      const cacheValid = this._historyCache && this._historyCacheTime && 
                         (now - this._historyCacheTime) < this._historyCacheDuration;
      
      if (cacheValid && !forceRefresh && !searchQuery && !deliveryBoyName && !status) {
        logger.info('📦 Using cached order history');
        return { orders: this._historyCache, error: null, fromCache: true };
      }
      
      // Determine which sheets to fetch from based on status filter
      let sheetsToFetch = [];
      if (status === 'delivered') {
        sheetsToFetch = ['delivered', 'selfpick'];
      } else if (status === 'cancelled') {
        sheetsToFetch = ['cancelled'];
      } else {
        // All statuses - fetch from all completed order sheets
        sheetsToFetch = ['delivered', 'cancelled', 'selfpick'];
      }
      
      for (const sheetType of sheetsToFetch) {
        const sheet = await this.getSheetByType(sheets, sheetType);
        if (!sheet) continue;
        
        try {
          const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheet.sheetName}!A:M`
          });
          
          const rows = response.data.values || [];
          let currentDate = null; // Track current date header
          
          // Parse rows (skip date headers and column headers)
          // Date headers start with emoji charCode 55357 or contain date patterns
          for (const row of rows) {
            if (!row[0]) continue;
            const firstChar = row[0].charCodeAt(0);
            
            // Check if this is a date header row (emoji calendar icon)
            if (firstChar === 55357) {
              // Parse date from header like "📅 Monday, 2/2/2026 (2026)" or "📅 02-Feb-2026"
              const dateText = row[0];
              try {
                // Try to extract date - look for patterns like "2/2/2026" or "02-Feb-2026"
                const dateMatch = dateText.match(/(\d{1,2})[\/\-](\d{1,2}|\w{3})[\/\-](\d{4})/);
                if (dateMatch) {
                  const [, day, monthOrNum, year] = dateMatch;
                  const monthMap = { 'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5, 'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11 };
                  const month = isNaN(monthOrNum) ? monthMap[monthOrNum] : parseInt(monthOrNum) - 1;
                  currentDate = new Date(parseInt(year), month, parseInt(day));
                }
              } catch (e) {
                logger.info('Failed to parse date header:', dateText);
              }
              continue;
            }
            
            // Skip header row
            if (row[0] === 'Order ID') continue;
            
            // Column structure (13 columns): 
            // OrderID(0), Time(1), Phone(2), Name(3), Items(4), ItemsTotal(5), Delivery(6), Total(7), 
            // PaymentMethod(8), PaymentStatus(9), OrderStatus(10), Address(11), DeliveryPartner(12)
            
            // Use current date header or default to today
            const orderDate = currentDate || new Date();
            
            const order = {
              _id: `${sheetType}-${row[0] || ''}-${row[1] || ''}`.replace(/\s+/g, ''), // Unique ID from sheet type + order ID + time
              orderId: row[0] || '',
              time: row[1] || '',
              phone: row[2] || '',
              customerName: row[3] || '',
              items: row[4] || '',
              itemsTotal: parseFloat(row[5]) || 0,
              deliveryCharge: parseFloat(row[6]) || 0,
              totalAmount: parseFloat(row[7]) || parseFloat(row[5]) || 0,
              paymentMethod: row[8] || row[6] || '',
              paymentStatus: row[9] || row[7] || '',
              status: sheetType === 'selfpick' ? 'delivered' : sheetType,
              address: row[11] || row[9] || '',
              deliveryPartnerName: row[12] || row[10] || '',
              source: 'sheets',
              sheetType: sheetType,
              // Date fields for filtering
              orderDate: orderDate,
              deliveredAt: orderDate,
              statusUpdatedAt: orderDate,
              createdAt: orderDate
            };
            
            // Filter by delivery boy name if specified
            if (deliveryBoyName && order.deliveryPartnerName !== deliveryBoyName) {
              continue;
            }
            
            // Filter by search query (search in orderId, customerName, phone, items)
            if (searchQuery) {
              const query = searchQuery.toLowerCase();
              const matches = 
                order.orderId.toLowerCase().includes(query) ||
                order.customerName.toLowerCase().includes(query) ||
                order.phone.includes(query) ||
                order.items.toLowerCase().includes(query);
              if (!matches) continue;
            }
            
            allOrders.push(order);
          }
        } catch (sheetError) {
          logger.error(`Error fetching from ${sheet.sheetName}:`, sheetError.message);
        }
      }
      
      // Sort orders by DATE + TIME descending (most recent first)
      // This ensures all orders (delivery, cancelled, selfpick) are sorted properly
      allOrders.sort((a, b) => {
        // Helper to parse time string to seconds
        const parseTime = (timeStr) => {
          if (!timeStr) return 0;
          const str = timeStr.toString().toLowerCase().trim();
          // Match format: "2:30:15 pm" or "2:30 pm" or "14:30:15"
          const match12 = str.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)/i);
          const match24 = str.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
          
          if (match12) {
            let hours = parseInt(match12[1]);
            const mins = parseInt(match12[2]);
            const secs = parseInt(match12[3] || 0);
            const isPM = match12[4].toLowerCase() === 'pm';
            if (isPM && hours !== 12) hours += 12;
            if (!isPM && hours === 12) hours = 0;
            return hours * 3600 + mins * 60 + secs;
          } else if (match24) {
            const hours = parseInt(match24[1]);
            const mins = parseInt(match24[2]);
            const secs = parseInt(match24[3] || 0);
            return hours * 3600 + mins * 60 + secs;
          }
          return 0;
        };
        
        // First compare by date (orderDate), then by time
        const dateA = a.orderDate ? new Date(a.orderDate).getTime() : 0;
        const dateB = b.orderDate ? new Date(b.orderDate).getTime() : 0;
        
        // If dates are different, sort by date first (descending = recent first)
        if (dateA !== dateB) {
          return dateB - dateA;
        }
        
        // If same date, sort by time descending (most recent first)
        return parseTime(b.time) - parseTime(a.time);
      });
      
      // Update cache (only cache full unfiltered results)
      if (!searchQuery && !deliveryBoyName && !status) {
        this._historyCache = allOrders;
        this._historyCacheTime = Date.now();
        logger.info(`📦 Cached ${allOrders.length} orders for 60 seconds`);
      }
      
      logger.info(`📊 Fetched ${allOrders.length} orders from Google Sheets history (sorted by date+time)`);
      return { orders: allOrders, error: null };
    } catch (error) {
      logger.error('❌ Error fetching order history from sheets:', error.message);
      return { orders: [], error: error.message };
    }
  },

  // Get delivery partner history from Google Sheets with date filtering
  // Cost-saving: Fetches complete history from sheets instead of MongoDB
  async getDeliveryPartnerHistory(options = {}) {
    try {
      const auth = getAuthClient();
      if (!auth) return { orders: [], stats: { delivered: 0, cancelled: 0, earnings: 0 }, error: 'Google auth not configured' };
      
      const sheets = google.sheets({ version: 'v4', auth });
      const { deliveryBoyName, filter = 'all' } = options;
      
      if (!deliveryBoyName) {
        return { orders: [], stats: { delivered: 0, cancelled: 0, earnings: 0 }, error: 'Delivery partner name required' };
      }
      
      let allOrders = [];
      
      // Fetch from delivered and cancelled sheets
      const sheetsToFetch = ['delivered', 'cancelled'];
      
      for (const sheetType of sheetsToFetch) {
        const sheet = await this.getSheetByType(sheets, sheetType);
        if (!sheet) continue;
        
        try {
          const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheet.sheetName}!A:L`
          });
          
          const rows = response.data.values || [];
          let currentDate = null;
          
          // Parse rows
          for (const row of rows) {
            if (!row[0]) continue;
            
            // Check if this is a date header row (emoji charCode 55357)
            const firstChar = row[0].charCodeAt(0);
            if (firstChar === 55357) {
              // Extract date from header like "📅 01-Feb-2026"
              const dateMatch = row[0].match(/\s*(.+)/);
              if (dateMatch) {
                currentDate = dateMatch[1].trim();
              }
              continue;
            }
            
            // Column structure: OrderID, Time, Phone, Name, Items, Total, PaymentMethod, PaymentStatus, OrderStatus, Address, DeliveryPartner
            const deliveryPartner = row[10] || '';
            
            // Filter by delivery partner name
            if (deliveryPartner !== deliveryBoyName) {
              continue;
            }
            
            // Parse order date (use current date header or extract from time)
            let orderDate = null;
            if (currentDate) {
              try {
                // Parse date like "01-Feb-2026" or "15-Jan-2026"
                const [day, month, year] = currentDate.split('-');
                const monthMap = { 'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5, 'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11 };
                orderDate = new Date(parseInt(year), monthMap[month] || 0, parseInt(day));
              } catch (e) {
                orderDate = new Date();
              }
            }
            
            const order = {
              _id: `${sheetType}-${row[0] || ''}-${row[1] || ''}`.replace(/\s+/g, ''), // Unique ID
              orderId: row[0] || '',
              time: row[1] || '',
              phone: row[2] || '',
              customerName: row[3] || '',
              items: row[4] || '',
              totalAmount: parseFloat(row[5]) || 0,
              paymentMethod: row[6] || '',
              paymentStatus: row[7] || '',
              status: sheetType,
              address: row[9] || '',
              deliveryPartnerName: deliveryPartner,
              source: 'sheets',
              sheetType: sheetType,
              orderDate: orderDate,
              // For compatibility with frontend
              deliveredAt: orderDate,
              statusUpdatedAt: orderDate
            };
            
            allOrders.push(order);
          }
        } catch (sheetError) {
          logger.error(`Error fetching from ${sheetType}:`, sheetError.message);
        }
      }
      
      // Apply date filter
      const now = new Date();
      let filteredOrders = allOrders;
      
      if (filter === 'today') {
        const startOfDay = new Date(now);
        startOfDay.setHours(0, 0, 0, 0);
        filteredOrders = allOrders.filter(o => o.orderDate && o.orderDate >= startOfDay);
      } else if (filter === 'week') {
        // Get Monday of current week
        const dayOfWeek = now.getDay();
        const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - diffToMonday);
        startOfWeek.setHours(0, 0, 0, 0);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);
        filteredOrders = allOrders.filter(o => o.orderDate && o.orderDate >= startOfWeek && o.orderDate <= endOfWeek);
      } else if (filter === 'month') {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        filteredOrders = allOrders.filter(o => o.orderDate && o.orderDate >= startOfMonth && o.orderDate <= endOfMonth);
      }
      // 'all' - no date filter, return complete history
      
      // Sort by order date (newest first)
      filteredOrders.sort((a, b) => {
        if (!a.orderDate && !b.orderDate) return 0;
        if (!a.orderDate) return 1;
        if (!b.orderDate) return -1;
        return b.orderDate - a.orderDate;
      });
      
      // Calculate stats
      const deliveredOrders = filteredOrders.filter(o => o.status === 'delivered');
      const cancelledOrders = filteredOrders.filter(o => o.status === 'cancelled');
      const totalEarnings = deliveredOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
      
      logger.info(`📊 Fetched ${filteredOrders.length} orders for delivery partner "${deliveryBoyName}" (filter: ${filter})`);
      
      return { 
        orders: filteredOrders, 
        stats: {
          delivered: deliveredOrders.length,
          cancelled: cancelledOrders.length,
          earnings: totalEarnings
        },
        error: null 
      };
    } catch (error) {
      logger.error('❌ Error fetching delivery partner history from sheets:', error.message);
      return { orders: [], stats: { delivered: 0, cancelled: 0, earnings: 0 }, error: error.message };
    }
  },
  // Cost-saving: Store customers in Google Sheets instead of fetching from MongoDB

  // Initialize customers sheet with headers if not exists
  async initializeCustomersSheet() {
    try {
      const auth = getAuthClient();
      if (!auth) return false;
      
      const sheets = google.sheets({ version: 'v4', auth });
      const sheet = await this.getSheetByType(sheets, 'customers');
      
      if (!sheet) {
        logger.info('⚠️ Customers sheet not found. Please create a sheet named "customers" in your Google Spreadsheet');
        return false;
      }
      
      // Check if headers exist
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheet.sheetName}!A1:F1`
      });
      
      if (!response.data.values || response.data.values.length === 0) {
        // Add headers: Phone, Name, Orders Count, Total Spent, First Order Date, Last Order Date (no location - stored in order sheets)
        const headers = ['Phone', 'Name', 'Orders Count', 'Total Spent', 'First Order', 'Last Order'];
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${sheet.sheetName}!A1:F1`,
          valueInputOption: 'RAW',
          resource: { values: [headers] }
        });
        
        // Format header row - Professional blue header
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          resource: {
            requests: [
              {
                repeatCell: {
                  range: { sheetId: sheet.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 6 },
                  cell: {
                    userEnteredFormat: {
                      backgroundColor: { red: 0.08, green: 0.46, blue: 0.75 },  // Nice blue
                      textFormat: { bold: true, fontSize: 11, foregroundColor: { red: 1, green: 1, blue: 1 } },
                      horizontalAlignment: 'CENTER',
                      verticalAlignment: 'MIDDLE'
                    }
                  },
                  fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
                }
              },
              // Set column widths
              { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 130 }, fields: 'pixelSize' } },
              { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 180 }, fields: 'pixelSize' } },
              { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 110 }, fields: 'pixelSize' } },
              { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } },
              { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 4, endIndex: 5 }, properties: { pixelSize: 110 }, fields: 'pixelSize' } },
              { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 5, endIndex: 6 }, properties: { pixelSize: 110 }, fields: 'pixelSize' } },
              // Freeze header row
              { updateSheetProperties: { properties: { sheetId: sheet.sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } }
            ]
          }
        });
        
        logger.info('✅ Customers sheet initialized with headers');
      }
      
      return true;
    } catch (error) {
      logger.error('❌ Error initializing customers sheet:', error.message);
      return false;
    }
  },

  // Add or update customer in the customers sheet
  async addOrUpdateCustomer(phone, name = null, location = null) {
    try {
      const auth = getAuthClient();
      if (!auth) return false;
      
      const sheets = google.sheets({ version: 'v4', auth });
      const sheet = await this.getSheetByType(sheets, 'customers');
      
      if (!sheet) {
        logger.info('⚠️ Customers sheet not found');
        return false;
      }
      
      // Initialize sheet if needed
      await this.initializeCustomersSheet();
      
      // Check if customer already exists
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheet.sheetName}!A:F`
      });
      
      const rows = response.data.values || [];
      const existingRowIndex = rows.findIndex((row, index) => index > 0 && row[0] === phone);
      
      if (existingRowIndex !== -1) {
        // Update existing customer's name if provided
        if (name && name.trim()) {
          await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheet.sheetName}!B${existingRowIndex + 1}`,
            valueInputOption: 'RAW',
            resource: { values: [[name]] }
          });
        }
        
        logger.info(`📱 Customer ${phone} already exists, updated info`);
        return true;
      }
      
      // Add new customer with first order date (no location column)
      const dateStr = formatDateDDMMYYYY();
      const newRow = [phone, name || '', 0, 0, dateStr, ''];
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheet.sheetName}!A:F`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: { values: [newRow] }
      });
      
      // Get the row index of the newly added customer
      const updatedResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheet.sheetName}!A:A`
      });
      const allRows = updatedResponse.data.values || [];
      const newRowIndex = allRows.findIndex((row, index) => index > 0 && row[0] === phone);
      
      // Apply green background with bold text to the new customer row
      if (newRowIndex !== -1) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          resource: {
            requests: [{
              repeatCell: {
                range: { sheetId: sheet.sheetId, startRowIndex: newRowIndex, endRowIndex: newRowIndex + 1, startColumnIndex: 0, endColumnIndex: 6 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.85, green: 0.92, blue: 0.83 },  // Light green background
                    textFormat: { 
                      foregroundColor: { red: 0, green: 0, blue: 0 },
                      bold: true  // Bold text
                    },
                    horizontalAlignment: 'CENTER',
                    verticalAlignment: 'MIDDLE'
                  }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
              }
            }]
          }
        });
      }
      
      // Update Total Customers in dashboard_stats
      await this.incrementDashboardStat('Total Customers', 1);
      
      logger.info(`✅ Customer ${phone} added to Google Sheets`);
      return true;
    } catch (error) {
      logger.error('❌ Error adding customer to sheets:', error.message);
      return false;
    }
  },

  // Update customer's order in the sheet (called when order is delivered/cancelled)
  async updateCustomerOrder(phone, order, status) {
    try {
      const auth = getAuthClient();
      if (!auth) return false;
      
      const sheets = google.sheets({ version: 'v4', auth });
      const sheet = await this.getSheetByType(sheets, 'customers');
      
      if (!sheet) return false;
      
      // Get customer row
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheet.sheetName}!A:F`
      });
      
      const rows = response.data.values || [];
      const rowIndex = rows.findIndex((row, index) => index > 0 && row[0] === phone);
      
      if (rowIndex === -1) {
        // Customer not found, add them first
        await this.addOrUpdateCustomer(phone, order.customer?.name);
        return this.updateCustomerOrder(phone, order, status);
      }
      
      const currentRow = rows[rowIndex];
      const currentOrdersCount = parseInt(currentRow[2]) || 0;
      const currentTotalSpent = parseFloat(currentRow[3]) || 0;
      const firstOrderDate = currentRow[4] || ''; // Preserve first order date
      
      // Format date as dd/mm/yyyy
      const dateStr = formatDateDDMMYYYY();
      
      // Update totals (only add to total if delivered)
      const newOrdersCount = currentOrdersCount + 1;
      const newTotalSpent = status === 'delivered' ? currentTotalSpent + (order.totalAmount || 0) : currentTotalSpent;
      
      // Update the row - preserve first order date, update last order date
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheet.sheetName}!C${rowIndex + 1}:F${rowIndex + 1}`,
        valueInputOption: 'RAW',
        resource: { 
          values: [[newOrdersCount, newTotalSpent, firstOrderDate || dateStr, dateStr]] 
        }
      });
      
      // Apply clean styling with green background and bold text
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        resource: {
          requests: [{
            repeatCell: {
              range: { sheetId: sheet.sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: 0, endColumnIndex: 6 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.85, green: 0.92, blue: 0.83 },  // Light green background
                  textFormat: { 
                    foregroundColor: { red: 0, green: 0, blue: 0 },
                    bold: true  // Bold text
                  },
                  horizontalAlignment: 'CENTER',
                  verticalAlignment: 'MIDDLE'
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
            }
          }]
        }
      });
      
      logger.info(`✅ Customer ${phone} order history updated in Google Sheets`);
      return true;
    } catch (error) {
      logger.error('❌ Error updating customer order in sheets:', error.message);
      return false;
    }
  },

  // Get all customers from Google Sheets (for offers/broadcast) - with caching
  async getAllCustomers(forceRefresh = false) {
    try {
      // Check cache first (unless force refresh is requested)
      const now = Date.now();
      if (!forceRefresh && customerCache.data && (now - customerCache.timestamp) < customerCache.TTL) {
        logger.info(`📊 Returning ${customerCache.data.length} customers from cache`);
        return { customers: customerCache.data, error: null };
      }
      
      const auth = getAuthClient();
      if (!auth) return { customers: [], error: 'Auth not configured' };
      
      const sheets = google.sheets({ version: 'v4', auth });
      const sheet = await this.getSheetByType(sheets, 'customers');
      
      if (!sheet) {
        return { customers: [], error: 'Customers sheet not found' };
      }
      
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheet.sheetName}!A:F`
      });
      
      const rows = response.data.values || [];
      const customers = [];
      
      // Skip header row
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row[0]) continue; // Skip empty rows
        
        customers.push({
          phone: row[0] || '',
          name: row[1] || '',
          ordersCount: parseInt(row[2]) || 0,
          totalSpent: parseFloat(row[3]) || 0,
          firstOrderDate: row[4] || '',
          lastOrderDate: row[5] || '',
          rowIndex: i
        });
      }
      
      // Update cache
      customerCache.data = customers;
      customerCache.timestamp = now;
      
      logger.info(`📊 Fetched ${customers.length} customers from Google Sheets (cached)`);
      return { customers, error: null };
    } catch (error) {
      logger.error('❌ Error fetching customers from sheets:', error.message);
      return { customers: [], error: error.message };
    }
  },

  // Get top percentage of customers by total spent (for targeted offers)
  async getTopCustomersBySpent(percentage) {
    try {
      const { customers, error } = await this.getAllCustomers();
      
      if (error || customers.length === 0) {
        return { customers: [], error: error || 'No customers found' };
      }
      
      // Filter customers who have ordered at least once
      const orderedCustomers = customers.filter(c => c.ordersCount > 0 && c.totalSpent > 0);
      
      if (orderedCustomers.length === 0) {
        return { customers: [], error: 'No customers with orders found' };
      }
      
      // Sort by total spent (descending)
      orderedCustomers.sort((a, b) => b.totalSpent - a.totalSpent);
      
      // Calculate how many customers are in the top percentage
      const topCount = Math.max(1, Math.ceil(orderedCustomers.length * (percentage / 100)));
      
      // Get top customers
      const topCustomers = orderedCustomers.slice(0, topCount);
      
      logger.info(`📊 Top ${percentage}% customers: ${topCustomers.length} out of ${orderedCustomers.length}`);
      return { 
        customers: topCustomers, 
        totalCustomers: orderedCustomers.length,
        selectedCount: topCustomers.length,
        error: null 
      };
    } catch (error) {
      logger.error('❌ Error getting top customers:', error.message);
      return { customers: [], error: error.message };
    }
  },

  // Get customers who spent more than a minimum amount (for targeted offers)
  async getCustomersByMinSpent(minAmount) {
    try {
      const { customers, error } = await this.getAllCustomers();
      
      if (error || customers.length === 0) {
        return { customers: [], error: error || 'No customers found' };
      }
      
      // Filter customers who have spent more than the minimum amount
      const qualifiedCustomers = customers.filter(c => c.totalSpent >= minAmount);
      
      logger.info(`📊 Customers with ₹${minAmount}+ spent: ${qualifiedCustomers.length} out of ${customers.length}`);
      return { 
        customers: qualifiedCustomers, 
        totalCustomers: customers.length,
        selectedCount: qualifiedCustomers.length,
        error: null 
      };
    } catch (error) {
      logger.error('❌ Error getting customers by min spent:', error.message);
      return { customers: [], error: error.message };
    }
  },

  // Get customers who ordered more than X times (for targeted offers)
  async getCustomersByMinOrders(minOrders) {
    try {
      const { customers, error } = await this.getAllCustomers();
      
      if (error || customers.length === 0) {
        return { customers: [], error: error || 'No customers found' };
      }
      
      // Filter customers who have ordered more than the minimum times
      const qualifiedCustomers = customers.filter(c => c.ordersCount >= minOrders);
      
      logger.info(`📊 Customers with ${minOrders}+ orders: ${qualifiedCustomers.length} out of ${customers.length}`);
      return { 
        customers: qualifiedCustomers, 
        totalCustomers: customers.length,
        selectedCount: qualifiedCustomers.length,
        error: null 
      };
    } catch (error) {
      logger.error('❌ Error getting customers by min orders:', error.message);
      return { customers: [], error: error.message };
    }
  },

  // Clean up empty date headers from all sheets
  async cleanupEmptyDateHeaders() {
    try {
      const auth = getAuthClient();
      if (!auth) return false;
      
      const sheets = google.sheets({ version: 'v4', auth });
      const sheetTypes = ['new', 'delivered', 'cancelled', 'refunded', 'refundprocessing', 'refundfailed'];
      
      let totalRemoved = 0;
      
      for (const sheetType of sheetTypes) {
        const sheet = await this.getSheetByType(sheets, sheetType);
        if (!sheet) continue;
        
        try {
          // Get all rows from the sheet
          const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheet.sheetName}!A:A`
          });
          
          const rows = response.data.values || [];
          const rowsToDelete = [];
          
          // Find date header rows (emoji charCode 55357)
          for (let i = 0; i < rows.length; i++) {
            const cellValue = rows[i]?.[0] || '';
            const firstCharCode = cellValue.charCodeAt(0);
            if (firstCharCode === 55357) {
              // Check if next row is another date header or empty (no orders under this date)
              const nextRow = rows[i + 1]?.[0] || '';
              const isNextRowDateHeader = nextRow.charCodeAt(0) === 55357;
              const isNextRowEmpty = !nextRow || nextRow.trim() === '';
              const isLastRow = i === rows.length - 1;
              
              // If next row is another date header, empty, or this is the last row - this date header has no orders
              if (isNextRowDateHeader || isNextRowEmpty || isLastRow) {
                rowsToDelete.push(i);
              }
            }
          }
          
          // Delete rows from bottom to top to maintain correct indices
          if (rowsToDelete.length > 0) {
            rowsToDelete.sort((a, b) => b - a); // Sort descending
            
            for (const rowIndex of rowsToDelete) {
              await sheets.spreadsheets.batchUpdate({
                spreadsheetId: SPREADSHEET_ID,
                resource: {
                  requests: [{
                    deleteDimension: {
                      range: {
                        sheetId: sheet.sheetId,
                        dimension: 'ROWS',
                        startIndex: rowIndex,
                        endIndex: rowIndex + 1
                      }
                    }
                  }]
                }
              });
              totalRemoved++;
            }
            
            logger.info(`🗑️ Removed ${rowsToDelete.length} empty date headers from ${sheet.sheetName}`);
          }
        } catch (sheetError) {
          logger.error(`Error cleaning ${sheet.sheetName}:`, sheetError.message);
        }
      }
      
      if (totalRemoved > 0) {
        logger.info(`✅ Total empty date headers removed: ${totalRemoved}`);
      } else {
        logger.info('📅 No empty date headers to remove');
      }
      
      return true;
    } catch (error) {
      logger.error('❌ Error cleaning up empty date headers:', error.message);
      return false;
    }
  },

  // ==================== DAILY REPORTS SHEET FUNCTIONS ====================
  // Cost-saving: Store daily reports in Google Sheets instead of MongoDB

  // Initialize daily_reports sheet with headers
  async initializeDailyReportsSheet() {
    try {
      const auth = getAuthClient();
      if (!auth) return false;
      
      const sheets = google.sheets({ version: 'v4', auth });
      const sheet = await this.getSheetByType(sheets, 'daily_reports');
      
      if (!sheet) {
        logger.info('⚠️ daily_reports sheet not found. Please create it in your Google Spreadsheet');
        return false;
      }
      
      // Check if headers exist
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheet.sheetName}!A1:K1`
      });
      
      if (!response.data.values || response.data.values.length === 0) {
        const headers = ['Date', 'Revenue', 'Total Orders', 'Delivered', 'Cancelled', 'Self Pickup', 'COD Orders', 'UPI Orders', 'Items Sold', 'Top Items'];
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${sheet.sheetName}!A1:J1`,
          valueInputOption: 'RAW',
          resource: { values: [headers] }
        });
        
        // Format header row - Professional purple header
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          resource: {
            requests: [
              {
                repeatCell: {
                  range: { sheetId: sheet.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 10 },
                  cell: {
                    userEnteredFormat: {
                      backgroundColor: { red: 0.4, green: 0.2, blue: 0.6 },  // Purple
                      textFormat: { bold: true, fontSize: 11, foregroundColor: { red: 1, green: 1, blue: 1 } },
                      horizontalAlignment: 'CENTER',
                      verticalAlignment: 'MIDDLE'
                    }
                  },
                  fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
                }
              },
              // Set column widths for row-based format
              { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } },  // Date
              { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } },  // Revenue
              { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } },  // Total Orders
              { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 }, properties: { pixelSize: 80 }, fields: 'pixelSize' } },   // Delivered
              { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 4, endIndex: 5 }, properties: { pixelSize: 80 }, fields: 'pixelSize' } },   // Cancelled
              { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 5, endIndex: 6 }, properties: { pixelSize: 90 }, fields: 'pixelSize' } },   // Self Pickup
              { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 6, endIndex: 7 }, properties: { pixelSize: 90 }, fields: 'pixelSize' } },   // COD Orders
              { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 7, endIndex: 8 }, properties: { pixelSize: 90 }, fields: 'pixelSize' } },   // UPI Orders
              { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 8, endIndex: 9 }, properties: { pixelSize: 90 }, fields: 'pixelSize' } },   // Items Sold
              { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 9, endIndex: 10 }, properties: { pixelSize: 200 }, fields: 'pixelSize' } }, // Top Items
              // Freeze header row
              { updateSheetProperties: { properties: { sheetId: sheet.sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } }
            ]
          }
        });
        logger.info('✅ Daily reports sheet initialized with headers');
      }
      
      return true;
    } catch (error) {
      logger.error('❌ Error initializing daily_reports sheet:', error.message);
      return false;
    }
  },

  // Add or update daily report in sheet
  async saveDailyReport(report) {
    try {
      const auth = getAuthClient();
      if (!auth) return false;
      
      const sheets = google.sheets({ version: 'v4', auth });
      const sheet = await this.getSheetByType(sheets, 'daily_reports');
      if (!sheet) return false;
      
      const { date, revenue, orders, deliveredOrders, cancelledOrders, selfPickupOrders, refundedOrders, codOrders, upiOrders, itemsSold, items, categories } = report;
      
      // Get all rows to find existing date
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheet.sheetName}!A:M`
      });
      
      const rows = response.data.values || [];
      let existingRowIndex = -1;
      
      // Find if date exists (skip header)
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] === date) {
          existingRowIndex = i;
          break;
        }
      }
      
      // Format top items for display
      const topItems = items && items.length > 0 
        ? items.slice(0, 5).map(i => `${i.name} (${i.quantity})`).join(', ')
        : '';
      
      const rowData = [
        date,
        revenue || 0,
        orders || 0,
        deliveredOrders || 0,
        cancelledOrders || 0,
        selfPickupOrders || 0,
        codOrders || 0,
        upiOrders || 0,
        itemsSold || 0,
        topItems
      ];
      
      if (existingRowIndex > -1) {
        // Update existing row
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${sheet.sheetName}!A${existingRowIndex + 1}:J${existingRowIndex + 1}`,
          valueInputOption: 'RAW',
          resource: { values: [rowData] }
        });
        
        // Check if this is today's date - use green color, otherwise light blue
        const todayDate = formatDateDDMMYYYY();
        const isToday = date === todayDate;
        const bgColor = isToday 
          ? { red: 0.7, green: 0.9, blue: 0.7 }  // Light green for today
          : { red: 0.85, green: 0.92, blue: 1 }; // Light blue for past dates
        
        // Apply background and bold text to updated row
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          resource: {
            requests: [{
              repeatCell: {
                range: { 
                  sheetId: sheet.sheetId, 
                  startRowIndex: existingRowIndex, 
                  endRowIndex: existingRowIndex + 1, 
                  startColumnIndex: 0, 
                  endColumnIndex: 10 
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: bgColor,
                    textFormat: { 
                      foregroundColor: { red: 0, green: 0, blue: 0 },
                      bold: true
                    },
                    horizontalAlignment: 'CENTER',
                    verticalAlignment: 'MIDDLE'
                  }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
              }
            }]
          }
        });
      } else {
        // Add new row at the top (after header)
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          resource: {
            requests: [{
              insertDimension: {
                range: { sheetId: sheet.sheetId, dimension: 'ROWS', startIndex: 1, endIndex: 2 },
                inheritFromBefore: false
              }
            }]
          }
        });
        
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${sheet.sheetName}!A2:J2`,
          valueInputOption: 'RAW',
          resource: { values: [rowData] }
        });
        
        // Check if this is today's date - use green color, otherwise light blue
        const todayDate = formatDateDDMMYYYY();
        const isToday = date === todayDate;
        const bgColor = isToday 
          ? { red: 0.7, green: 0.9, blue: 0.7 }  // Light green for today
          : { red: 0.85, green: 0.92, blue: 1 }; // Light blue for past dates
        
        // Apply background and bold text to new row
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          resource: {
            requests: [{
              repeatCell: {
                range: { 
                  sheetId: sheet.sheetId, 
                  startRowIndex: 1, 
                  endRowIndex: 2, 
                  startColumnIndex: 0, 
                  endColumnIndex: 10 
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: bgColor,
                    textFormat: { 
                      foregroundColor: { red: 0, green: 0, blue: 0 },
                      bold: true
                    },
                    horizontalAlignment: 'CENTER',
                    verticalAlignment: 'MIDDLE'
                  }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
              }
            }]
          }
        });
      }
      
      logger.info(`📊 Daily report saved for ${date}`);
      return true;
    } catch (error) {
      logger.error('❌ Error saving daily report to sheet:', error.message);
      return false;
    }
  },

  // Real-time sync of daily report - aggregates current day's order data and saves to sheet
  async syncTodayDailyReport() {
    try {
      const Order = require('../../models/Order');
      
      const today = formatDateDDMMYYYY();
      const dateFilter = { createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } };
      
      const [orderStats, itemStats, paymentStats] = await Promise.all([
        Order.aggregate([
          { $match: dateFilter },
          {
            $group: {
              _id: null,
              totalOrders: { $sum: 1 },
              totalRevenue: { 
                $sum: { 
                  $cond: [
                    { $and: [{ $eq: ['$paymentStatus', 'paid'] }, { $not: { $in: ['$status', ['cancelled', 'refunded']] } }] },
                    '$totalAmount',
                    0
                  ]
                }
              },
              deliveredOrders: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
              cancelledOrders: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
              selfPickupOrders: { $sum: { $cond: [{ $eq: ['$deliveryType', 'pickup'] }, 1, 0] } }
            }
          }
        ]),
        Order.aggregate([
          { $match: { ...dateFilter, status: { $nin: ['cancelled', 'refunded'] } } },
          { $unwind: '$items' },
          { $group: { _id: '$items.name', name: { $first: '$items.name' }, quantity: { $sum: '$items.quantity' }, revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } } } },
          { $sort: { quantity: -1 } },
          { $limit: 5 }
        ]),
        Order.aggregate([
          { $match: dateFilter },
          { $group: { _id: '$paymentMethod', count: { $sum: 1 } } }
        ])
      ]);
      
      const currentStats = orderStats[0] || { totalOrders: 0, totalRevenue: 0, deliveredOrders: 0, cancelledOrders: 0, selfPickupOrders: 0 };
      const totalItemsSold = itemStats.reduce((sum, item) => sum + item.quantity, 0);
      const codOrders = paymentStats.find(p => p._id === 'cod')?.count || 0;
      const upiOrders = paymentStats.find(p => p._id === 'upi')?.count || 0;
      
      const report = {
        date: today,
        revenue: currentStats.totalRevenue,
        orders: currentStats.totalOrders,
        deliveredOrders: currentStats.deliveredOrders,
        cancelledOrders: currentStats.cancelledOrders,
        selfPickupOrders: currentStats.selfPickupOrders,
        codOrders,
        upiOrders,
        itemsSold: totalItemsSold,
        items: itemStats
      };
      
      await this.saveDailyReport(report);
      logger.info('📊 Daily report synced in real-time');
      return true;
    } catch (error) {
      logger.error('❌ Error syncing daily report:', error.message);
      return false;
    }
  },

  // Get daily report from sheet
  async getDailyReport(date) {
    try {
      const auth = getAuthClient();
      if (!auth) return null;
      
      const sheets = google.sheets({ version: 'v4', auth });
      const sheet = await this.getSheetByType(sheets, 'daily_reports');
      if (!sheet) return null;
      
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheet.sheetName}!A:M`
      });
      
      const rows = response.data.values || [];
      
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] === date) {
          return {
            date: rows[i][0],
            revenue: parseFloat(rows[i][1]) || 0,
            orders: parseInt(rows[i][2]) || 0,
            deliveredOrders: parseInt(rows[i][3]) || 0,
            cancelledOrders: parseInt(rows[i][4]) || 0,
            selfPickupOrders: parseInt(rows[i][5]) || 0,
            codOrders: parseInt(rows[i][6]) || 0,
            upiOrders: parseInt(rows[i][7]) || 0,
            itemsSold: parseInt(rows[i][8]) || 0
          };
        }
      }
      
      return null;
    } catch (error) {
      logger.error('❌ Error fetching daily report from sheet:', error.message);
      return null;
    }
  },

  // Get reports for date range
  async getReportsInRange(startDate, endDate) {
    try {
      const auth = getAuthClient();
      if (!auth) return [];
      
      const sheets = google.sheets({ version: 'v4', auth });
      const sheet = await this.getSheetByType(sheets, 'daily_reports');
      if (!sheet) return [];
      
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheet.sheetName}!A:M`
      });
      
      const rows = response.data.values || [];
      const reports = [];
      
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      for (let i = 1; i < rows.length; i++) {
        const rowDate = new Date(rows[i][0]);
        if (rowDate >= start && rowDate <= end) {
          reports.push({
            date: rows[i][0],
            revenue: parseFloat(rows[i][1]) || 0,
            orders: parseInt(rows[i][2]) || 0,
            deliveredOrders: parseInt(rows[i][3]) || 0,
            cancelledOrders: parseInt(rows[i][4]) || 0,
            selfPickupOrders: parseInt(rows[i][5]) || 0,
            codOrders: parseInt(rows[i][6]) || 0,
            upiOrders: parseInt(rows[i][7]) || 0,
            itemsSold: parseInt(rows[i][8]) || 0
          });
        }
      }
      
      return reports;
    } catch (error) {
      logger.error('❌ Error fetching reports in range from sheet:', error.message);
      return [];
    }
  },

  // ==================== DASHBOARD STATS SHEET FUNCTIONS ====================
  // Cost-saving: Store dashboard stats in Google Sheets instead of MongoDB

  // Initialize dashboard_stats sheet with headers
  async initializeDashboardStatsSheet() {
    try {
      const auth = getAuthClient();
      if (!auth) return false;
      
      const sheets = google.sheets({ version: 'v4', auth });
      const sheet = await this.getSheetByType(sheets, 'dashboard_stats');
      
      if (!sheet) {
        logger.info('⚠️ dashboard_stats sheet not found. Please create it in your Google Spreadsheet');
        return false;
      }
      
      // Check if headers exist
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheet.sheetName}!A1:D1`
      });
      
      if (!response.data.values || response.data.values.length === 0) {
        const headers = ['Metric', 'Value', 'Last Updated', 'Notes'];
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${sheet.sheetName}!A1:D1`,
          valueInputOption: 'RAW',
          resource: { values: [headers] }
        });
        
        // Add default metrics
        const defaultMetrics = [
          ['Total Orders', '0', formatDateTimeDDMMYYYY(), 'Lifetime total'],
          ['Total Revenue', '0', formatDateTimeDDMMYYYY(), 'Lifetime total'],
          ['Total Customers', '0', formatDateTimeDDMMYYYY(), 'Lifetime total'],
          ['Today Orders', '0', formatDateTimeDDMMYYYY(), 'Resets daily'],
          ['Today Revenue', '0', formatDateTimeDDMMYYYY(), 'Resets daily'],
          ['Today Date', formatDateDDMMYYYY(), formatDateTimeDDMMYYYY(), 'Current date']
        ];
        
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${sheet.sheetName}!A2:D7`,
          valueInputOption: 'RAW',
          resource: { values: defaultMetrics }
        });
        
        // Format header row
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          resource: {
            requests: [{
              repeatCell: {
                range: { sheetId: sheet.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 4 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.1, green: 0.3, blue: 0.5 },
                    textFormat: { bold: true, fontSize: 11, foregroundColor: { red: 1, green: 1, blue: 1 } },
                    horizontalAlignment: 'CENTER'
                  }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
              }
            }]
          }
        });
        logger.info('✅ Dashboard stats sheet initialized with headers');
      }
      
      return true;
    } catch (error) {
      logger.error('❌ Error initializing dashboard_stats sheet:', error.message);
      return false;
    }
  },

  // Update dashboard stat in sheet
  async updateDashboardStat(metric, value) {
    try {
      const auth = getAuthClient();
      if (!auth) return false;
      
      const sheets = google.sheets({ version: 'v4', auth });
      const sheet = await this.getSheetByType(sheets, 'dashboard_stats');
      if (!sheet) return false;
      
      // Get all rows to find metric
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheet.sheetName}!A:D`
      });
      
      const rows = response.data.values || [];
      let rowIndex = -1;
      
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] === metric) {
          rowIndex = i;
          break;
        }
      }
      
      const timestamp = formatDateTimeDDMMYYYY();
      
      if (rowIndex > -1) {
        // Update existing metric
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${sheet.sheetName}!B${rowIndex + 1}:C${rowIndex + 1}`,
          valueInputOption: 'RAW',
          resource: { values: [[value, timestamp]] }
        });
        
        // Apply light orange background and bold text to updated row
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          resource: {
            requests: [{
              repeatCell: {
                range: { 
                  sheetId: sheet.sheetId, 
                  startRowIndex: rowIndex, 
                  endRowIndex: rowIndex + 1, 
                  startColumnIndex: 0, 
                  endColumnIndex: 4 
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 1, green: 0.92, blue: 0.85 },  // Light orange/peach
                    textFormat: { 
                      foregroundColor: { red: 0, green: 0, blue: 0 },
                      bold: true
                    },
                    horizontalAlignment: 'CENTER',
                    verticalAlignment: 'MIDDLE'
                  }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
              }
            }]
          }
        });
      } else {
        // Add new metric
        await sheets.spreadsheets.values.append({
          spreadsheetId: SPREADSHEET_ID,
          range: `${sheet.sheetName}!A:D`,
          valueInputOption: 'RAW',
          insertDataOption: 'INSERT_ROWS',
          resource: { values: [[metric, value, timestamp, '']] }
        });
        
        // Get the newly added row index
        const updatedResponse = await sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range: `${sheet.sheetName}!A:A`
        });
        const allRows = updatedResponse.data.values || [];
        const newRowIndex = allRows.findIndex((row, index) => index > 0 && row[0] === metric);
        
        // Apply light orange background and bold text to new row
        if (newRowIndex !== -1) {
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            resource: {
              requests: [{
                repeatCell: {
                  range: { 
                    sheetId: sheet.sheetId, 
                    startRowIndex: newRowIndex, 
                    endRowIndex: newRowIndex + 1, 
                    startColumnIndex: 0, 
                    endColumnIndex: 4 
                  },
                  cell: {
                    userEnteredFormat: {
                      backgroundColor: { red: 1, green: 0.92, blue: 0.85 },  // Light orange/peach
                      textFormat: { 
                        foregroundColor: { red: 0, green: 0, blue: 0 },
                        bold: true
                      },
                      horizontalAlignment: 'CENTER',
                      verticalAlignment: 'MIDDLE'
                    }
                  },
                  fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
                }
              }]
            }
          });
        }
      }
      
      return true;
    } catch (error) {
      logger.error('❌ Error updating dashboard stat in sheet:', error.message);
      return false;
    }
  },

  // Get all dashboard stats from sheet
  async getDashboardStats() {
    try {
      const auth = getAuthClient();
      if (!auth) return {};
      
      const sheets = google.sheets({ version: 'v4', auth });
      const sheet = await this.getSheetByType(sheets, 'dashboard_stats');
      if (!sheet) return {};
      
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheet.sheetName}!A:D`
      });
      
      const rows = response.data.values || [];
      const stats = {};
      
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][0]) {
          const metric = rows[i][0];
          const value = rows[i][1];
          // Convert to number if it looks like a number
          stats[metric] = isNaN(value) ? value : parseFloat(value);
        }
      }
      
      return stats;
    } catch (error) {
      logger.error('❌ Error fetching dashboard stats from sheet:', error.message);
      return {};
    }
  },

  // Increment dashboard stat
  async incrementDashboardStat(metric, amount = 1) {
    try {
      const stats = await this.getDashboardStats();
      const currentValue = stats[metric] || 0;
      await this.updateDashboardStat(metric, currentValue + amount);
      return true;
    } catch (error) {
      logger.error('❌ Error incrementing dashboard stat:', error.message);
      return false;
    }
  },

  // ==================== CLEAR / RESET SHEET FUNCTIONS ====================

  // Clear all order sheets (neworders, delivered, cancelled, selfpick) with proper headers
  async clearAllOrderSheets() {
    try {
      const auth = getAuthClient();
      if (!auth) return { success: false, error: 'Auth not configured' };
      
      const sheets = google.sheets({ version: 'v4', auth });
      const orderSheets = ['new', 'delivered', 'cancelled', 'selfpick'];
      const results = {};
      
      // Column headers for order sheets
      const orderHeaders = ['Order ID', 'Time', 'Phone', 'Name', 'Items', 'Items Total', 'Delivery', 'Total', 'Payment Method', 'Payment Status', 'Order Status', 'Address', 'Delivery Partner'];
      
      // Sheet-specific colors
      const sheetColors = {
        new: { red: 0.93, green: 0.8, blue: 0.2 },       // Yellow/Orange
        delivered: { red: 0.2, green: 0.6, blue: 0.4 },  // Green
        cancelled: { red: 0.8, green: 0.2, blue: 0.2 },  // Red
        selfpick: { red: 0.2, green: 0.5, blue: 0.7 }    // Blue
      };
      
      for (const sheetType of orderSheets) {
        const sheet = await this.getSheetByType(sheets, sheetType);
        if (!sheet) {
          results[sheetType] = 'Sheet not found';
          continue;
        }
        
        try {
          // Get current data count
          const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheet.sheetName}!A:A`
          });
          const rowCount = (response.data.values || []).length;
          
          // Clear all data
          await sheets.spreadsheets.values.clear({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheet.sheetName}!A:Z`
          });
          
          // Add headers
          await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheet.sheetName}!A1:M1`,
            valueInputOption: 'RAW',
            resource: { values: [orderHeaders] }
          });
          
          // Apply header formatting and column widths
          const headerColor = sheetColors[sheetType];
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            resource: {
              requests: [
                // Header styling
                {
                  repeatCell: {
                    range: { sheetId: sheet.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 13 },
                    cell: {
                      userEnteredFormat: {
                        backgroundColor: headerColor,
                        textFormat: { bold: true, fontSize: 10, foregroundColor: { red: 1, green: 1, blue: 1 } },
                        horizontalAlignment: 'CENTER',
                        verticalAlignment: 'MIDDLE',
                        wrapStrategy: 'WRAP'
                      }
                    },
                    fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)'
                  }
                },
                // Header row height
                {
                  updateDimensionProperties: {
                    range: { sheetId: sheet.sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
                    properties: { pixelSize: 35 },
                    fields: 'pixelSize'
                  }
                },
                // Column widths: OrderID(80), Time(70), Phone(100), Name(100), Items(200), ItemsTotal(80), Delivery(70), Total(80), PayMethod(100), PayStatus(100), OrderStatus(100), Address(180), DeliveryPartner(120)
                { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 85 }, fields: 'pixelSize' } },
                { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 75 }, fields: 'pixelSize' } },
                { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } },
                { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } },
                { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 4, endIndex: 5 }, properties: { pixelSize: 220 }, fields: 'pixelSize' } },
                { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 5, endIndex: 6 }, properties: { pixelSize: 85 }, fields: 'pixelSize' } },
                { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 6, endIndex: 7 }, properties: { pixelSize: 70 }, fields: 'pixelSize' } },
                { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 7, endIndex: 8 }, properties: { pixelSize: 80 }, fields: 'pixelSize' } },
                { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 8, endIndex: 9 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } },
                { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 9, endIndex: 10 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } },
                { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 10, endIndex: 11 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } },
                { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 11, endIndex: 12 }, properties: { pixelSize: 180 }, fields: 'pixelSize' } },
                { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 12, endIndex: 13 }, properties: { pixelSize: 120 }, fields: 'pixelSize' } },
                // Freeze header row
                {
                  updateSheetProperties: {
                    properties: {
                      sheetId: sheet.sheetId,
                      gridProperties: { frozenRowCount: 1 }
                    },
                    fields: 'gridProperties.frozenRowCount'
                  }
                }
              ]
            }
          });
          
          results[sheetType] = `Cleared ${rowCount} rows, headers added`;
        } catch (err) {
          results[sheetType] = `Error: ${err.message}`;
        }
      }
      
      logger.info('🧹 Order sheets cleared:', results);
      return { success: true, results };
    } catch (error) {
      logger.error('❌ Error clearing order sheets:', error.message);
      return { success: false, error: error.message };
    }
  },

  // Clear and reset customers sheet
  async clearCustomersSheet() {
    try {
      const auth = getAuthClient();
      if (!auth) return { success: false, error: 'Auth not configured' };
      
      const sheets = google.sheets({ version: 'v4', auth });
      const sheet = await this.getSheetByType(sheets, 'customers');
      
      if (!sheet) return { success: false, error: 'Customers sheet not found' };
      
      // Get current row count
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheet.sheetName}!A:A`
      });
      const rowCount = (response.data.values || []).length;
      
      // Clear all data including header
      await sheets.spreadsheets.values.clear({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheet.sheetName}!A:Z`
      });
      
      // Re-initialize with headers and formatting (matches initializeCustomersSheet)
      const headers = ['Phone', 'Name', 'Orders Count', 'Total Spent', 'First Order', 'Last Order'];
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheet.sheetName}!A1:F1`,
        valueInputOption: 'RAW',
        resource: { values: [headers] }
      });
      
      // Apply header formatting - Professional blue header
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        resource: {
          requests: [
            // Clear formatting from extra columns (G onwards) that may have old header color
            {
              repeatCell: {
                range: { sheetId: sheet.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 6, endColumnIndex: 20 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 1, green: 1, blue: 1 },
                    textFormat: { bold: false, foregroundColor: { red: 0, green: 0, blue: 0 } }
                  }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat)'
              }
            },
            {
              repeatCell: {
                range: { sheetId: sheet.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 6 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.08, green: 0.46, blue: 0.75 },  // Nice blue
                    textFormat: { bold: true, fontSize: 11, foregroundColor: { red: 1, green: 1, blue: 1 } },
                    horizontalAlignment: 'CENTER',
                    verticalAlignment: 'MIDDLE'
                  }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
              }
            },
            // Set column widths
            { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 130 }, fields: 'pixelSize' } },
            { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 180 }, fields: 'pixelSize' } },
            { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 110 }, fields: 'pixelSize' } },
            { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } },
            { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 4, endIndex: 5 }, properties: { pixelSize: 110 }, fields: 'pixelSize' } },
            { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 5, endIndex: 6 }, properties: { pixelSize: 110 }, fields: 'pixelSize' } },
            // Freeze header row
            { updateSheetProperties: { properties: { sheetId: sheet.sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } }
          ]
        }
      });
      
      logger.info(`🧹 Customers sheet cleared: ${rowCount - 1} rows removed`);
      return { success: true, clearedRows: rowCount - 1 };
    } catch (error) {
      logger.error('❌ Error clearing customers sheet:', error.message);
      return { success: false, error: error.message };
    }
  },

  // Clear and reset daily reports sheet - ROW FORMAT: dates as rows, metrics as columns
  async clearDailyReportsSheet() {
    try {
      const auth = getAuthClient();
      if (!auth) return { success: false, error: 'Auth not configured' };
      
      const sheets = google.sheets({ version: 'v4', auth });
      const sheet = await this.getSheetByType(sheets, 'daily_reports');
      
      if (!sheet) return { success: false, error: 'Daily reports sheet not found' };
      
      // Clear all data
      await sheets.spreadsheets.values.clear({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheet.sheetName}!A:ZZ`
      });
      
      // ROW FORMAT: Metrics as column headers, each date is a row
      const headers = ['Date', 'Revenue', 'Total Orders', 'Delivered', 'Cancelled', 'Self Pickup', 'COD Orders', 'UPI Orders', 'Items Sold', 'Top Items'];
      
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheet.sheetName}!A1:J1`,
        valueInputOption: 'RAW',
        resource: { values: [headers] }
      });
      
      // Apply formatting
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        resource: {
          requests: [
            // Header row formatting - Professional purple
            {
              repeatCell: {
                range: { sheetId: sheet.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 10 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.4, green: 0.2, blue: 0.6 },
                    textFormat: { bold: true, fontSize: 11, foregroundColor: { red: 1, green: 1, blue: 1 } },
                    horizontalAlignment: 'CENTER',
                    verticalAlignment: 'MIDDLE'
                  }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
              }
            },
            // Column widths
            { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } },  // Date
            { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } },  // Revenue
            { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } },  // Total Orders
            { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 }, properties: { pixelSize: 80 }, fields: 'pixelSize' } },   // Delivered
            { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 4, endIndex: 5 }, properties: { pixelSize: 80 }, fields: 'pixelSize' } },   // Cancelled
            { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 5, endIndex: 6 }, properties: { pixelSize: 90 }, fields: 'pixelSize' } },   // Self Pickup
            { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 6, endIndex: 7 }, properties: { pixelSize: 90 }, fields: 'pixelSize' } },   // COD Orders
            { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 7, endIndex: 8 }, properties: { pixelSize: 90 }, fields: 'pixelSize' } },   // UPI Orders
            { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 8, endIndex: 9 }, properties: { pixelSize: 90 }, fields: 'pixelSize' } },   // Items Sold
            { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 9, endIndex: 10 }, properties: { pixelSize: 200 }, fields: 'pixelSize' } }, // Top Items
            // Freeze header row
            {
              updateSheetProperties: {
                properties: {
                  sheetId: sheet.sheetId,
                  gridProperties: { frozenRowCount: 1, frozenColumnCount: 0 }
                },
                fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount'
              }
            }
          ]
        }
      });
      
      logger.info('🧹 Daily reports sheet cleared and reformatted (row-based format)');
      return { success: true, message: 'Sheet reset with row-based format' };
    } catch (error) {
      logger.error('❌ Error clearing daily_reports sheet:', error.message);
      return { success: false, error: error.message };
    }
  },

  // Clear and reset dashboard stats sheet (keeps default metrics with values reset to 0)
  async clearDashboardStatsSheet() {
    try {
      const auth = getAuthClient();
      if (!auth) return { success: false, error: 'Auth not configured' };
      
      const sheets = google.sheets({ version: 'v4', auth });
      const sheet = await this.getSheetByType(sheets, 'dashboard_stats');
      
      if (!sheet) return { success: false, error: 'Dashboard stats sheet not found' };
      
      // Clear all data
      await sheets.spreadsheets.values.clear({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheet.sheetName}!A:Z`
      });
      
      // Add headers
      const headers = ['Metric', 'Value', 'Last Updated', 'Notes'];
      
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheet.sheetName}!A1:D1`,
        valueInputOption: 'RAW',
        resource: { values: [headers] }
      });
      
      // Add default metrics with values reset to 0
      const timestamp = formatDateTimeDDMMYYYY();
      const todayDate = formatDateDDMMYYYY();
      const defaultMetrics = [
        ['Total Orders', '0', timestamp, 'Lifetime total'],
        ['Total Revenue', '0', timestamp, 'Lifetime total'],
        ['Total Customers', '0', timestamp, 'Lifetime total'],
        ['Today Orders', '0', timestamp, 'Resets daily'],
        ['Today Revenue', '0', timestamp, 'Resets daily'],
        ['Today Date', todayDate, timestamp, 'Current date']
      ];
      
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheet.sheetName}!A2:D7`,
        valueInputOption: 'RAW',
        resource: { values: defaultMetrics }
      });
      
      // Apply formatting
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        resource: {
          requests: [
            // Header formatting - dark blue background with white bold text
            {
              repeatCell: {
                range: { sheetId: sheet.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 4 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.1, green: 0.3, blue: 0.5 },
                    textFormat: { bold: true, fontSize: 11, foregroundColor: { red: 1, green: 1, blue: 1 } },
                    horizontalAlignment: 'CENTER',
                    verticalAlignment: 'MIDDLE'
                  }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
              }
            },
            // First row (Total Orders) - bold with light orange background
            {
              repeatCell: {
                range: { sheetId: sheet.sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 4 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 1, green: 0.92, blue: 0.85 },
                    textFormat: { bold: true, foregroundColor: { red: 0, green: 0, blue: 0 } },
                    horizontalAlignment: 'CENTER',
                    verticalAlignment: 'MIDDLE'
                  }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
              }
            },
            // All other data rows (rows 3-7) - light gray background with centered text
            {
              repeatCell: {
                range: { sheetId: sheet.sheetId, startRowIndex: 2, endRowIndex: 7, startColumnIndex: 0, endColumnIndex: 4 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.95, green: 0.95, blue: 0.95 },
                    textFormat: { bold: false, foregroundColor: { red: 0.2, green: 0.2, blue: 0.2 } },
                    horizontalAlignment: 'CENTER',
                    verticalAlignment: 'MIDDLE'
                  }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
              }
            },
            // Column widths
            { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 140 }, fields: 'pixelSize' } },
            { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 120 }, fields: 'pixelSize' } },
            { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 180 }, fields: 'pixelSize' } },
            { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 }, properties: { pixelSize: 120 }, fields: 'pixelSize' } },
            // Freeze header row
            { updateSheetProperties: { properties: { sheetId: sheet.sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } }
          ]
        }
      });
      
      logger.info('🧹 Dashboard stats sheet reset with default metrics (values set to 0)');
      return { success: true, message: 'Sheet reset with default metrics' };
    } catch (error) {
      logger.error('❌ Error clearing dashboard_stats sheet:', error.message);
      return { success: false, error: error.message };
    }
  },

  // Clear all sheets at once
  async clearAllSheets() {
    logger.info('\n🧹 Clearing all Google Sheets data...\n');
    
    const results = {
      orders: await this.clearAllOrderSheets(),
      customers: await this.clearCustomersSheet(),
      dailyReports: await this.clearDailyReportsSheet(),
      dashboardStats: await this.clearDashboardStatsSheet()
    };
    
    logger.info('\n✅ All sheets cleared!\n');
    return results;
  },

  // ==================== UPDATED DAILY REPORT FUNCTIONS ====================
  
  // Save daily report - NEW FORMAT: dates as columns
  async saveDailyReportByDate(report) {
    try {
      const auth = getAuthClient();
      if (!auth) return false;
      
      const sheets = google.sheets({ version: 'v4', auth });
      const sheet = await this.getSheetByType(sheets, 'daily_reports');
      if (!sheet) return false;
      
      const { date, revenue, orders, deliveredOrders, cancelledOrders, refundedOrders, codOrders, upiOrders, itemsSold, items, categories } = report;
      
      // Get current headers to find the date column
      const headerResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheet.sheetName}!1:1`
      });
      
      const headers = headerResponse.data.values?.[0] || ['Metric'];
      let dateColumnIndex = headers.findIndex(h => h === date);
      
      // If date column doesn't exist, add it
      if (dateColumnIndex === -1) {
        dateColumnIndex = headers.length;
        
        // Add date header
        const columnLetter = this.getColumnLetter(dateColumnIndex);
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${sheet.sheetName}!${columnLetter}1`,
          valueInputOption: 'RAW',
          resource: { values: [[`📅 ${date}`]] }
        });
        
        // Format the new date header
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          resource: {
            requests: [
              {
                repeatCell: {
                  range: { sheetId: sheet.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: dateColumnIndex, endColumnIndex: dateColumnIndex + 1 },
                  cell: {
                    userEnteredFormat: {
                      backgroundColor: { red: 0.4, green: 0.2, blue: 0.6 },
                      textFormat: { bold: true, fontSize: 10, foregroundColor: { red: 1, green: 1, blue: 1 } },
                      horizontalAlignment: 'CENTER',
                      verticalAlignment: 'MIDDLE'
                    }
                  },
                  fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
                }
              },
              {
                updateDimensionProperties: {
                  range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: dateColumnIndex, endIndex: dateColumnIndex + 1 },
                  properties: { pixelSize: 110 },
                  fields: 'pixelSize'
                }
              }
            ]
          }
        });
      }
      
      // Get top item and category
      const topItem = items?.[0]?.name || '-';
      const topCategory = categories?.[0]?.category || '-';
      
      // Prepare column data (rows 2-11 for the date column)
      const columnData = [
        [`₹${(revenue || 0).toLocaleString()}`],
        [orders || 0],
        [deliveredOrders || 0],
        [cancelledOrders || 0],
        [refundedOrders || 0],
        [codOrders || 0],
        [upiOrders || 0],
        [itemsSold || 0],
        [topItem],
        [topCategory]
      ];
      
      const columnLetter = this.getColumnLetter(dateColumnIndex);
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheet.sheetName}!${columnLetter}2:${columnLetter}11`,
        valueInputOption: 'RAW',
        resource: { values: columnData }
      });
      
      // Format the data cells
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        resource: {
          requests: [
            {
              repeatCell: {
                range: { sheetId: sheet.sheetId, startRowIndex: 1, endRowIndex: 11, startColumnIndex: dateColumnIndex, endColumnIndex: dateColumnIndex + 1 },
                cell: {
                  userEnteredFormat: {
                    horizontalAlignment: 'CENTER',
                    verticalAlignment: 'MIDDLE'
                  }
                },
                fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)'
              }
            },
            // Revenue row styling (row 2)
            {
              repeatCell: {
                range: { sheetId: sheet.sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: dateColumnIndex, endColumnIndex: dateColumnIndex + 1 },
                cell: {
                  userEnteredFormat: {
                    textFormat: { bold: true, foregroundColor: { red: 0.13, green: 0.55, blue: 0.13 } }
                  }
                },
                fields: 'userEnteredFormat(textFormat)'
              }
            }
          ]
        }
      });
      
      logger.info(`📊 Daily report saved for ${date} in column ${columnLetter}`);
      return true;
    } catch (error) {
      logger.error('❌ Error saving daily report by date:', error.message);
      return false;
    }
  },

  // Get all daily reports (all dates)
  async getAllDailyReports() {
    try {
      const auth = getAuthClient();
      if (!auth) return [];
      
      const sheets = google.sheets({ version: 'v4', auth });
      const sheet = await this.getSheetByType(sheets, 'daily_reports');
      if (!sheet) return [];
      
      // Get all data
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheet.sheetName}!A:ZZ`
      });
      
      const rows = response.data.values || [];
      if (rows.length < 2) return [];
      
      const headers = rows[0];
      const reports = [];
      
      // Each column after A is a date
      for (let col = 1; col < headers.length; col++) {
        const dateHeader = headers[col] || '';
        const date = dateHeader.replace('📅 ', '').trim();
        
        if (!date) continue;
        
        reports.push({
          date,
          revenue: rows[1]?.[col]?.replace(/[₹,]/g, '') || '0',
          orders: rows[2]?.[col] || '0',
          delivered: rows[3]?.[col] || '0',
          cancelled: rows[4]?.[col] || '0',
          refunded: rows[5]?.[col] || '0',
          cod: rows[6]?.[col] || '0',
          upi: rows[7]?.[col] || '0',
          itemsSold: rows[8]?.[col] || '0',
          topItem: rows[9]?.[col] || '-',
          topCategory: rows[10]?.[col] || '-'
        });
      }
      
      return reports;
    } catch (error) {
      logger.error('❌ Error fetching all daily reports:', error.message);
      return [];
    }
  },

  // Helper function to convert column index to letter (0=A, 1=B, 26=AA, etc.)
  getColumnLetter(index) {
    let letter = '';
    while (index >= 0) {
      letter = String.fromCharCode((index % 26) + 65) + letter;
      index = Math.floor(index / 26) - 1;
    }
    return letter;
  },

  // ==================== REFORMAT EXISTING SHEETS ====================
  
  // Reformat customers sheet - remove Location column, 6 columns now
  async reformatCustomersSheet() {
    try {
      const auth = getAuthClient();
      if (!auth) return { success: false, error: 'Auth not configured' };
      
      const sheets = google.sheets({ version: 'v4', auth });
      const sheet = await this.getSheetByType(sheets, 'customers');
      if (!sheet) return { success: false, error: 'Sheet not found' };
      
      // Get all data from customers (old format had 7 columns with Location)
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheet.sheetName}!A:G`
      });
      const rows = response.data.values || [];
      
      // Check if we need to migrate from old 7-column format to new 6-column format
      const hasLocationColumn = rows[0] && rows[0][2] === 'Location';
      
      if (hasLocationColumn && rows.length > 1) {
        logger.info('📊 Migrating customers from 7-column to 6-column format (removing Location)...');
        
        // Prepare new data without Location column
        const newData = [];
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          if (i === 0) {
            // New headers
            newData.push(['Phone', 'Name', 'Orders Count', 'Total Spent', 'First Order', 'Last Order']);
          } else {
            // Data row: skip column C (Location), shift everything left
            newData.push([
              row[0] || '',  // Phone
              row[1] || '',  // Name
              row[3] || 0,   // Orders Count (was column D)
              row[4] || 0,   // Total Spent (was column E)
              row[5] || '',  // First Order (was column F)
              row[6] || ''   // Last Order (was column G)
            ]);
          }
        }
        
        // Clear old data
        await sheets.spreadsheets.values.clear({
          spreadsheetId: SPREADSHEET_ID,
          range: `${sheet.sheetName}!A:G`
        });
        
        // Write new data
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${sheet.sheetName}!A1`,
          valueInputOption: 'RAW',
          resource: { values: newData }
        });
        
        logger.info(`📊 Migrated ${newData.length - 1} customers to new format`);
      } else {
        // Just update header if needed
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${sheet.sheetName}!A1:F1`,
          valueInputOption: 'RAW',
          resource: { values: [['Phone', 'Name', 'Orders Count', 'Total Spent', 'First Order', 'Last Order']] }
        });
      }
      
      // Get updated row count
      const updatedResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheet.sheetName}!A:A`
      });
      const totalRows = (updatedResponse.data.values || []).length;
      
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        resource: {
          requests: [
            // Header row styling - Professional green (matching delivered sheet)
            {
              repeatCell: {
                range: { sheetId: sheet.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 6 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.2, green: 0.66, blue: 0.33 },  // Green header
                    textFormat: { bold: true, fontSize: 12, foregroundColor: { red: 1, green: 1, blue: 1 }, fontFamily: 'Arial' },
                    horizontalAlignment: 'CENTER',
                    verticalAlignment: 'MIDDLE',
                    borders: {
                      bottom: { style: 'SOLID', width: 2, color: { red: 0.15, green: 0.5, blue: 0.25 } }
                    }
                  }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,borders)'
              }
            },
            // Data rows styling - Only for rows with data (rows 2 to totalRows)
            {
              repeatCell: {
                range: { sheetId: sheet.sheetId, startRowIndex: 1, endRowIndex: totalRows, startColumnIndex: 0, endColumnIndex: 6 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.9, green: 0.97, blue: 0.9 },  // Light green tint
                    textFormat: { bold: true, foregroundColor: { red: 0, green: 0, blue: 0 }, fontSize: 11, fontFamily: 'Arial' },
                    horizontalAlignment: 'CENTER',
                    verticalAlignment: 'MIDDLE'
                  }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
              }
            },
            // Column widths
            { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 130 }, fields: 'pixelSize' } },
            { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 180 }, fields: 'pixelSize' } },
            { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 110 }, fields: 'pixelSize' } },
            { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } },
            { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 4, endIndex: 5 }, properties: { pixelSize: 110 }, fields: 'pixelSize' } },
            { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 5, endIndex: 6 }, properties: { pixelSize: 110 }, fields: 'pixelSize' } },
            // Clear extra columns beyond F
            // Freeze header
            { updateSheetProperties: { properties: { sheetId: sheet.sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } }
          ]
        }
      });
      
      // Clear any extra columns beyond F
      await sheets.spreadsheets.values.clear({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheet.sheetName}!G:ZZ`
      });
      
      logger.info('✅ Customers sheet reformatted (6 columns, no Location)');
      return { success: true };
    } catch (error) {
      logger.error('❌ Error reformatting customers sheet:', error.message);
      return { success: false, error: error.message };
    }
  },

  // Reformat daily_reports sheet - convert column format to row format
  async reformatDailyReportsSheet() {
    try {
      const auth = getAuthClient();
      if (!auth) return { success: false, error: 'Auth not configured' };
      
      const sheets = google.sheets({ version: 'v4', auth });
      const sheet = await this.getSheetByType(sheets, 'daily_reports');
      if (!sheet) return { success: false, error: 'Sheet not found' };
      
      // Get existing data to check format
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheet.sheetName}!A:ZZ`
      });
      
      const rows = response.data.values || [];
      
      // Check if it's in column format (first column has "Metric", "💰 Revenue", etc.)
      const isColumnFormat = rows.length > 0 && (rows[0]?.[0] === 'Metric' || rows[1]?.[0]?.includes('Revenue'));
      
      // Check if there's old column data beyond column K (columns L onwards have dates like "📅 2026-02-02")
      const hasOldColumnData = rows[0]?.length > 11 && rows[0].some((cell, idx) => idx > 10 && cell && cell.includes('📅'));
      
      if (isColumnFormat || hasOldColumnData) {
        logger.info('📊 Converting daily_reports from column format to row format...');
        
        // Extract data from column format (dates in columns L, M, N, etc.)
        const extractedReports = [];
        const headers = rows[0] || [];
        
        // Start from column 11 (L) if old column data exists there, else column 1
        const startCol = hasOldColumnData ? 11 : 1;
        
        for (let col = startCol; col < headers.length; col++) {
          const dateHeader = headers[col] || '';
          const date = dateHeader.replace('📅 ', '').trim();
          if (!date || date === '') continue;
          
          extractedReports.push({
            date,
            revenue: parseFloat((rows[1]?.[col] || '0').replace(/[₹,]/g, '')) || 0,
            orders: parseInt(rows[2]?.[col]) || 0,
            deliveredOrders: parseInt(rows[3]?.[col]) || 0,
            cancelledOrders: parseInt(rows[4]?.[col]) || 0,
            refundedOrders: parseInt(rows[5]?.[col]) || 0,
            codOrders: parseInt(rows[6]?.[col]) || 0,
            upiOrders: parseInt(rows[7]?.[col]) || 0,
            itemsSold: parseInt(rows[8]?.[col]) || 0,
            topItem: rows[9]?.[col] || '-',
            topCategory: rows[10]?.[col] || '-'
          });
        }
        
        // Clear sheet completely
        await sheets.spreadsheets.values.clear({
          spreadsheetId: SPREADSHEET_ID,
          range: `${sheet.sheetName}!A:ZZ`
        });
        
        // Add row-format headers
        const newHeaders = ['Date', 'Revenue', 'Total Orders', 'Delivered', 'Cancelled', 'Refunded', 'COD Orders', 'UPI Orders', 'Items Sold', 'Top Items'];
        
        // Prepare all rows
        const allRows = [newHeaders];
        for (const report of extractedReports) {
          allRows.push([
            report.date,
            report.revenue,
            report.orders,
            report.deliveredOrders,
            report.cancelledOrders,
            report.refundedOrders,
            report.codOrders,
            report.upiOrders,
            report.itemsSold,
            report.topItem
          ]);
        }
        
        // Write all data
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${sheet.sheetName}!A1`,
          valueInputOption: 'RAW',
          resource: { values: allRows }
        });
        
        logger.info(`📊 Migrated ${extractedReports.length} daily reports to row format`);
      }
      
      // Clear any extra columns beyond J (old Top Categories column)
      await sheets.spreadsheets.values.clear({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheet.sheetName}!K:ZZ`
      });
      
      // Convert existing dates from YYYY-MM-DD to dd/mm/yyyy format
      const dateConvertResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheet.sheetName}!A:A`
      });
      
      const dateRows = dateConvertResponse.data.values || [];
      const convertedDates = [];
      
      for (let i = 0; i < dateRows.length; i++) {
        const cell = dateRows[i]?.[0] || '';
        // Check if date is in YYYY-MM-DD format
        if (i > 0 && cell && /^\d{4}-\d{2}-\d{2}$/.test(cell)) {
          const [year, month, day] = cell.split('-');
          convertedDates.push([`${day}/${month}/${year}`]);
        } else {
          convertedDates.push([cell]);
        }
      }
      
      // Write converted dates back
      if (convertedDates.length > 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${sheet.sheetName}!A1:A${convertedDates.length}`,
          valueInputOption: 'RAW',
          resource: { values: convertedDates }
        });
        logger.info(`📅 Converted dates to dd/mm/yyyy format`);
      }
      
      // Get total rows after conversion
      const finalResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheet.sheetName}!A:A`
      });
      const allDateRows = finalResponse.data.values || [];
      const totalRows = allDateRows.length;
      
      // Find today's date row index
      const todayDate = formatDateDDMMYYYY();
      let todayRowIndex = -1;
      for (let i = 1; i < allDateRows.length; i++) {
        if (allDateRows[i]?.[0] === todayDate) {
          todayRowIndex = i;
          break;
        }
      }
      
      // Build styling requests
      const requests = [
        // Header row styling - Professional purple
        {
          repeatCell: {
            range: { sheetId: sheet.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 10 },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.4, green: 0.2, blue: 0.6 },
                textFormat: { bold: true, fontSize: 11, foregroundColor: { red: 1, green: 1, blue: 1 } },
                horizontalAlignment: 'CENTER',
                verticalAlignment: 'MIDDLE'
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
          }
        },
        // Data rows styling - Light blue background with bold centered text
        {
          repeatCell: {
            range: { sheetId: sheet.sheetId, startRowIndex: 1, endRowIndex: Math.max(totalRows, 50), startColumnIndex: 0, endColumnIndex: 10 },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.85, green: 0.92, blue: 1 },  // Light blue
                textFormat: { foregroundColor: { red: 0, green: 0, blue: 0 }, bold: true },
                horizontalAlignment: 'CENTER',
                verticalAlignment: 'MIDDLE'
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
          }
        },
        // Column widths
        { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 }, properties: { pixelSize: 80 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 4, endIndex: 5 }, properties: { pixelSize: 80 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 5, endIndex: 6 }, properties: { pixelSize: 80 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 6, endIndex: 7 }, properties: { pixelSize: 90 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 7, endIndex: 8 }, properties: { pixelSize: 90 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 8, endIndex: 9 }, properties: { pixelSize: 90 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 9, endIndex: 10 }, properties: { pixelSize: 200 }, fields: 'pixelSize' } },
        // Freeze header
        { updateSheetProperties: { properties: { sheetId: sheet.sheetId, gridProperties: { frozenRowCount: 1, frozenColumnCount: 0 } }, fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount' } }
      ];
      
      // Add green styling for today's row if found
      if (todayRowIndex > 0) {
        requests.push({
          repeatCell: {
            range: { sheetId: sheet.sheetId, startRowIndex: todayRowIndex, endRowIndex: todayRowIndex + 1, startColumnIndex: 0, endColumnIndex: 10 },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.7, green: 0.9, blue: 0.7 },  // Light green for today
                textFormat: { foregroundColor: { red: 0, green: 0, blue: 0 }, bold: true },
                horizontalAlignment: 'CENTER',
                verticalAlignment: 'MIDDLE'
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
          }
        });
        logger.info(`📅 Today's row (${todayDate}) highlighted in green`);
      }
      
      // Apply styling
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        resource: { requests }
      });
      
      logger.info('✅ Daily reports sheet reformatted (row-based format)');
      return { success: true };
    } catch (error) {
      logger.error('❌ Error reformatting daily reports sheet:', error.message);
      return { success: false, error: error.message };
    }
  },

  // Reformat dashboard_stats sheet with bold + center styling
  async reformatDashboardStatsSheet() {
    try {
      const auth = getAuthClient();
      if (!auth) return { success: false, error: 'Auth not configured' };
      
      const sheets = google.sheets({ version: 'v4', auth });
      const sheet = await this.getSheetByType(sheets, 'dashboard_stats');
      if (!sheet) return { success: false, error: 'Sheet not found' };
      
      // Get existing data
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheet.sheetName}!A:D`
      });
      
      const rows = response.data.values || [];
      const totalRows = rows.length;
      
      // Ensure headers exist
      if (totalRows === 0 || rows[0]?.[0] !== 'Metric') {
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${sheet.sheetName}!A1:D1`,
          valueInputOption: 'RAW',
          resource: { values: [['Metric', 'Value', 'Last Updated', 'Notes']] }
        });
      }
      
      // Get final row count
      const finalResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheet.sheetName}!A:A`
      });
      const finalRows = (finalResponse.data.values || []).length;
      
      // Apply styling
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        resource: {
          requests: [
            // Header row styling - Professional dark blue
            {
              repeatCell: {
                range: { sheetId: sheet.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 4 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.1, green: 0.3, blue: 0.5 },
                    textFormat: { bold: true, fontSize: 11, foregroundColor: { red: 1, green: 1, blue: 1 } },
                    horizontalAlignment: 'CENTER',
                    verticalAlignment: 'MIDDLE'
                  }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
              }
            },
            // Data rows styling - Light orange/peach with bold centered text
            {
              repeatCell: {
                range: { sheetId: sheet.sheetId, startRowIndex: 1, endRowIndex: Math.max(finalRows, 20), startColumnIndex: 0, endColumnIndex: 4 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 1, green: 0.92, blue: 0.85 },  // Light orange/peach
                    textFormat: { foregroundColor: { red: 0, green: 0, blue: 0 }, bold: true },
                    horizontalAlignment: 'CENTER',
                    verticalAlignment: 'MIDDLE'
                  }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
              }
            },
            // Column widths
            { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 150 }, fields: 'pixelSize' } },
            { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 120 }, fields: 'pixelSize' } },
            { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 150 }, fields: 'pixelSize' } },
            { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 }, properties: { pixelSize: 120 }, fields: 'pixelSize' } },
            // Freeze header
            { updateSheetProperties: { properties: { sheetId: sheet.sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } }
          ]
        }
      });
      
      logger.info('✅ Dashboard stats sheet reformatted (bold + center)');
      return { success: true };
    } catch (error) {
      logger.error('❌ Error reformatting dashboard stats sheet:', error.message);
      return { success: false, error: error.message };
    }
  }
};

module.exports = googleSheets;
