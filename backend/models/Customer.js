const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  name: { type: String },
  email: { type: String },
  hasOrdered: { type: Boolean, default: false }, // Track if customer has placed at least one order
  addresses: [{
    label: String,
    address: String,
    isDefault: Boolean
  }],
  deliveryAddress: {
    latitude: Number,
    longitude: Number,
    address: String,
    updatedAt: Date
  },
  cart: [{
    menuItem: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem' },
    quantity: Number,
    addedAt: { type: Date, default: Date.now }
  }],
  // Active offers applied to this customer (from targeted broadcasts)
  activeOffers: [{
    offerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Offer' },
    offerType: String,
    title: String,
    discountType: String,
    discountValue: Number,
    percentage: Number,
    appliedItems: [{ type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem' }],
    appliedCategories: [String],
    validUntil: Date,
    appliedAt: { type: Date, default: Date.now }
  }],
  conversationState: {
    currentStep: { type: String, default: 'welcome' },
    selectedService: String,
    selectedCategory: String,
    selectedItem: String,
    pendingOrderId: String,
    foodTypePreference: String,
    paymentMethod: String,
    lastInteraction: Date,
    context: mongoose.Schema.Types.Mixed
  },
  orderHistory: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order' }],
  totalOrders: { type: Number, default: 0 },
  totalSpent: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

customerSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes for performance
customerSchema.index({ createdAt: -1 });
customerSchema.index({ totalOrders: -1 });
customerSchema.index({ totalSpent: -1 });
customerSchema.index({ 'conversationState.lastInteraction': -1 });
customerSchema.index({ name: 'text', phone: 'text' });

module.exports = mongoose.model('Customer', customerSchema);
