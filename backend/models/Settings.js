const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true },
  updatedAt: { type: Date, default: Date.now },
  updatedBy: { type: String }
});

// Pre-save middleware to update timestamp
settingsSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// In-memory cache for frequently accessed settings (TTL-based)
const _settingsCache = new Map();
const SETTINGS_CACHE_TTL = 30 * 1000; // 30 seconds — balances freshness vs speed

// Static method to get a setting value (cached)
settingsSchema.statics.getValue = async function(key, defaultValue = null) {
  const now = Date.now();
  const cached = _settingsCache.get(key);
  if (cached && (now - cached.ts) < SETTINGS_CACHE_TTL) {
    return cached.value;
  }
  const setting = await this.findOne({ key });
  const value = setting ? setting.value : defaultValue;
  _settingsCache.set(key, { value, ts: now });
  return value;
};

// Static method to set a setting value (invalidates cache)
settingsSchema.statics.setValue = async function(key, value, updatedBy = null) {
  _settingsCache.delete(key); // Invalidate cache on write
  const setting = await this.findOneAndUpdate(
    { key },
    { key, value, updatedAt: Date.now(), updatedBy },
    { upsert: true, new: true }
  );
  return setting;
};

module.exports = mongoose.model('Settings', settingsSchema);
