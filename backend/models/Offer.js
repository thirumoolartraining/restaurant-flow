const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema({
  title: { type: String, default: '' },
  description: { type: String },
  offerType: { type: String, default: '' }, // e.g., "1+1 Offer", "Buy 2 Get 1", "50% Off"
  percentage: { type: Number }, // Discount percentage (optional)
  appliedItems: [{ type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem' }], // Items this offer applies to
  appliedCategories: [{ type: String }], // Categories this offer applies to
  image: { type: String, required: true }, // Legacy field for backward compatibility
  imageMobile: { type: String }, // Mobile view image (800x160px recommended)
  imageTablet: { type: String }, // Tablet view image (1200x240px recommended)
  imageDesktop: { type: String }, // Desktop view image (1920x384px recommended)
  code: { type: String },
  discountType: { type: String, enum: ['percentage', 'fixed', 'none'], default: 'none' },
  discountValue: { type: Number, default: 0 },
  minOrderAmount: { type: Number, default: 0 },
  validFrom: { type: Date, default: Date.now },
  validUntil: { type: Date },
  isActive: { type: Boolean, default: true },
  showAsPopup: { type: Boolean, default: true },
  buttonText: { type: String, default: 'Order Now' },
  buttonLink: { type: String, default: '/menu' },
  
  // Targeting options for customers
  targetType: { 
    type: String, 
    enum: ['all', 'top_percentage', 'min_spent', 'min_orders'], 
    default: 'all' 
  }, // 'all' = all customers, 'top_percentage' = top X%, 'min_spent' = spent > X, 'min_orders' = ordered > X times
  targetPercentage: { type: Number, default: 100 }, // For top_percentage: e.g., 10 = top 10% customers
  targetMinSpent: { type: Number, default: 0 }, // For min_spent: minimum amount spent (e.g., 500 = customers who spent ₹500+)
  targetMinOrders: { type: Number, default: 0 }, // For min_orders: minimum order count (e.g., 5 = customers with 5+ orders)
  targetedCustomers: [{ type: String }], // Phone numbers of targeted customers (populated when offer is created)
  
  // WhatsApp template fields (Meta Business API)
  templateName: { type: String, default: null }, // Unique template name submitted to Meta (e.g. offer_abc123)
  templateStatus: { 
    type: String, 
    enum: ['none', 'pending', 'approved', 'rejected'], 
    default: 'none' 
  }, // Meta template review status
  metaTemplateId: { type: String, default: null }, // Template ID returned by Meta
  templateRejectionReason: { type: String, default: null }, // Reason if Meta rejects
  templateSubmittedAt: { type: Date, default: null }, // When template was submitted for review
  templateApprovedAt: { type: Date, default: null }, // When template was approved
  broadcastSentAt: { type: Date, default: null }, // When offer was broadcast to customers
  broadcastResult: { type: mongoose.Schema.Types.Mixed, default: null }, // Result of last broadcast
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

offerSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

offerSchema.index({ isActive: 1, showAsPopup: 1 });
offerSchema.index({ validFrom: 1, validUntil: 1 });
offerSchema.index({ templateName: 1 }, { sparse: true });

module.exports = mongoose.model('Offer', offerSchema);
