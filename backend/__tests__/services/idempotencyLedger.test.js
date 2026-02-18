jest.mock('../../services/logger', () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }));

const mongoose = require('mongoose');

describe('Idempotency ledger in-memory behavior', () => {
  beforeEach(() => {
    Object.defineProperty(mongoose.connection, 'readyState', {
      value: 0,
      configurable: true
    });
  });

  it('returns STARTED then IN_PROGRESS then DUPLICATE_PROCESSED', async () => {
    const { getIdempotencyLedger, STATUS } = require('../../services/idempotency/idempotencyLedger');
    const ledger = getIdempotencyLedger();

    const first = await ledger.tryStart('test:key');
    expect(first.status).toBe(STATUS.STARTED);

    const inProgress = await ledger.tryStart('test:key');
    expect(inProgress.status).toBe(STATUS.IN_PROGRESS);

    await ledger.markProcessed('test:key', { ok: true });

    const duplicateProcessed = await ledger.tryStart('test:key');
    expect(duplicateProcessed.status).toBe(STATUS.DUPLICATE_PROCESSED);
  });
});
