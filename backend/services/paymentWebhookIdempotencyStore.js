const mongoose = require('mongoose');
const logger = require('./logger');

const paymentWebhookSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, index: true },
  status: { type: String, enum: ['processing', 'processed', 'failed'], default: 'processing' },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  processedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });

let PaymentWebhookEvent;
try {
  PaymentWebhookEvent = mongoose.model('PaymentWebhookEvent');
} catch (error) {
  PaymentWebhookEvent = mongoose.model('PaymentWebhookEvent', paymentWebhookSchema, 'payment_webhook_events');
}

class InMemoryPaymentWebhookIdempotencyStore {
  constructor() {
    this.events = new Map();
  }

  async checkAndMarkProcessing(key, metadata = {}) {
    const existing = this.events.get(key);
    if (existing && existing.status === 'processed') {
      return { isDuplicate: true, existing };
    }

    this.events.set(key, {
      key,
      status: 'processing',
      metadata,
      createdAt: new Date().toISOString()
    });

    return { isDuplicate: false };
  }

  async markProcessed(key, metadata = {}) {
    const existing = this.events.get(key) || { key, createdAt: new Date().toISOString() };
    this.events.set(key, {
      ...existing,
      metadata: { ...(existing.metadata || {}), ...metadata },
      status: 'processed',
      processedAt: new Date().toISOString()
    });
  }

  async markFailed(key, metadata = {}) {
    const existing = this.events.get(key) || { key, createdAt: new Date().toISOString() };
    this.events.set(key, {
      ...existing,
      metadata: { ...(existing.metadata || {}), ...metadata },
      status: 'failed'
    });
  }
}

class MongoPaymentWebhookIdempotencyStore {
  async checkAndMarkProcessing(key, metadata = {}) {
    const result = await PaymentWebhookEvent.findOneAndUpdate(
      { key },
      {
        $setOnInsert: {
          key,
          status: 'processing',
          metadata,
          createdAt: new Date()
        }
      },
      {
        upsert: true,
        new: false,
        rawResult: true
      }
    );

    if (result?.lastErrorObject?.updatedExisting && result?.value?.status === 'processed') {
      return { isDuplicate: true, existing: result.value };
    }

    return { isDuplicate: false };
  }

  async markProcessed(key, metadata = {}) {
    await PaymentWebhookEvent.updateOne(
      { key },
      {
        $set: {
          status: 'processed',
          metadata,
          processedAt: new Date()
        }
      },
      { upsert: true }
    );
  }

  async markFailed(key, metadata = {}) {
    await PaymentWebhookEvent.updateOne(
      { key },
      {
        $set: {
          status: 'failed',
          metadata
        }
      },
      { upsert: true }
    );
  }
}

const inMemoryStore = new InMemoryPaymentWebhookIdempotencyStore();
const mongoStore = new MongoPaymentWebhookIdempotencyStore();

function isMongoConnected() {
  return mongoose.connection.readyState === 1;
}

function getPaymentWebhookIdempotencyStore() {
  if (isMongoConnected()) {
    return mongoStore;
  }

  logger.warn('MongoDB not connected, using in-memory payment webhook idempotency store');
  return inMemoryStore;
}

function buildPaymentWebhookIdempotencyKey(event = {}) {
  const eventType = event.event || 'unknown_event';
  const payload = event.payload || {};
  const paymentId = payload.payment?.entity?.id
    || payload.refund?.entity?.payment_id
    || payload.payment_link?.entity?.id
    || 'unknown_payment';
  const entityId = payload.refund?.entity?.id
    || payload.payment?.entity?.id
    || payload.payment_link?.entity?.id
    || 'unknown_entity';
  const webhookId = event.account_id || event.created_at || 'unknown_webhook';

  return `${eventType}:${entityId}:${paymentId}:${webhookId}`;
}

module.exports = {
  getPaymentWebhookIdempotencyStore,
  buildPaymentWebhookIdempotencyKey,
  InMemoryPaymentWebhookIdempotencyStore
};
