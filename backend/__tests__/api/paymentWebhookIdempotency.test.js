const express = require('express');
const request = require('supertest');

jest.mock('../../middleware/rateLimiter', () => ({
  publicRateLimiter: (req, res, next) => next(),
  webhookRateLimiter: (req, res, next) => next()
}));

jest.mock('../../middleware/auth', () => (req, res, next) => next());

const mockOrderFindOne = jest.fn();
jest.mock('../../models/Order', () => ({ findOne: (...args) => mockOrderFindOne(...args) }));
jest.mock('../../models/Customer', () => ({ findOne: jest.fn() }));
jest.mock('../../services/whatsapp', () => ({ sendButtons: jest.fn(), sendImageWithButtons: jest.fn() }));
jest.mock('../../services/brevoMail', () => ({ sendOrderConfirmation: jest.fn() }));
jest.mock('../../services/razorpay', () => ({ createOrder: jest.fn(), refund: jest.fn() }));
jest.mock('../../services/googleSheets', () => ({ updateOrderStatus: jest.fn().mockResolvedValue(true) }));
jest.mock('../../services/chatbotImages', () => ({ getImageUrl: jest.fn().mockResolvedValue(null) }));
jest.mock('../../services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../../services/eventEmitter', () => ({ emit: jest.fn() }));
const mockUserFind = jest.fn().mockResolvedValue([{ pushToken: 'token-1' }]);
const mockSendNotification = jest.fn().mockResolvedValue(true);
jest.mock('../../models/User', () => ({ find: (...args) => mockUserFind(...args) }));
jest.mock('../../services/pushNotification', () => ({ sendNotification: (...args) => mockSendNotification(...args) }));

const mockCheckAndMarkProcessing = jest.fn();
const mockMarkProcessed = jest.fn().mockResolvedValue();

jest.mock('../../services/paymentWebhookIdempotencyStore', () => ({
  getPaymentWebhookIdempotencyStore: () => ({ checkAndMarkProcessing: mockCheckAndMarkProcessing, markProcessed: mockMarkProcessed, markFailed: jest.fn() }),
  buildPaymentWebhookIdempotencyKey: (event) => `${event.event}:${event.payload?.payment?.entity?.id || 'unknown'}`
}));

describe('Razorpay webhook idempotency', () => {
  let mockSave;
  let orderDoc;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSave = jest.fn().mockResolvedValue();
    orderDoc = {
      orderId: 'ORD1',
      paymentStatus: 'pending',
      status: 'pending',
      trackingUpdates: [],
      totalAmount: 100,
      customer: { phone: '919999999999', name: 'Test' },
      save: mockSave
    };
    mockOrderFindOne.mockResolvedValue(orderDoc);
  });

  it('processes first webhook and skips replay without side effects', async () => {
    mockCheckAndMarkProcessing
      .mockResolvedValueOnce({ isDuplicate: false })
      .mockResolvedValueOnce({ isDuplicate: true });

    const router = require('../../routes/payment');
    const app = express();
    app.use('/api/payment', router);

    const eventPayload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_123',
            payment_link_id: 'plink_1'
          }
        }
      }
    };

    await request(app)
      .post('/api/payment/razorpay-webhook')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(eventPayload))
      .expect(200);

    await request(app)
      .post('/api/payment/razorpay-webhook')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(eventPayload))
      .expect(200);

    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockMarkProcessed).toHaveBeenCalledTimes(1);
  });
});
