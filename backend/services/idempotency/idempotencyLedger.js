const mongoose = require('mongoose');
const logger = require('../logger');
const IdempotencyKeyModel = require('../../models/IdempotencyKey');

const STATUS = {
  STARTED: 'STARTED',
  DUPLICATE_PROCESSED: 'DUPLICATE_PROCESSED',
  IN_PROGRESS: 'IN_PROGRESS'
};

class InMemoryLedger {
  constructor() {
    this.map = new Map();
  }

  cleanExpired() {
    const now = Date.now();
    for (const [key, value] of this.map.entries()) {
      if (value.expiresAt <= now) {
        this.map.delete(key);
      }
    }
  }

  async tryStart(key, { ttlMs = 24 * 60 * 60 * 1000, metadata = {} } = {}) {
    this.cleanExpired();
    const entry = this.map.get(key);

    if (entry?.status === 'processed') {
      return { status: STATUS.DUPLICATE_PROCESSED, key };
    }

    if (entry?.status === 'processing') {
      return { status: STATUS.IN_PROGRESS, key };
    }

    this.map.set(key, {
      key,
      status: 'processing',
      metadata,
      expiresAt: Date.now() + ttlMs,
      createdAt: Date.now()
    });

    return { status: STATUS.STARTED, key };
  }

  async markProcessed(key, metadata = {}) {
    const entry = this.map.get(key) || { key, expiresAt: Date.now() + 24 * 60 * 60 * 1000 };
    this.map.set(key, { ...entry, status: 'processed', metadata: { ...(entry.metadata || {}), ...metadata } });
  }

  async markFailed(key, metadata = {}) {
    const entry = this.map.get(key) || { key, expiresAt: Date.now() + 60 * 60 * 1000 };
    this.map.set(key, { ...entry, status: 'failed', metadata: { ...(entry.metadata || {}), ...metadata } });
  }
}

class MongoLedger {
  async tryStart(key, { ttlMs = 24 * 60 * 60 * 1000, metadata = {} } = {}) {
    const expiresAt = new Date(Date.now() + ttlMs);

    try {
      await IdempotencyKeyModel.create({
        key,
        status: 'processing',
        metadata,
        expiresAt
      });
      return { status: STATUS.STARTED, key };
    } catch (error) {
      if (error?.code !== 11000) {
        throw error;
      }

      const existing = await IdempotencyKeyModel.findOne({ key }).lean();
      if (existing?.status === 'processed') {
        return { status: STATUS.DUPLICATE_PROCESSED, key };
      }

      return { status: STATUS.IN_PROGRESS, key };
    }
  }

  async markProcessed(key, metadata = {}) {
    await IdempotencyKeyModel.updateOne(
      { key },
      { $set: { status: 'processed', metadata, updatedAt: new Date() } },
      { upsert: true }
    );
  }

  async markFailed(key, metadata = {}) {
    await IdempotencyKeyModel.updateOne(
      { key },
      { $set: { status: 'failed', metadata, updatedAt: new Date() } },
      { upsert: true }
    );
  }
}

const memoryLedger = new InMemoryLedger();
const mongoLedger = new MongoLedger();

function getIdempotencyLedger() {
  if (mongoose.connection.readyState === 1) {
    return mongoLedger;
  }

  logger.warn('MongoDB unavailable, using in-memory idempotency ledger');
  return memoryLedger;
}

module.exports = {
  STATUS,
  getIdempotencyLedger
};
