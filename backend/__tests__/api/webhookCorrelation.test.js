const express = require('express');
const request = require('supertest');

jest.mock('../../middleware/rateLimiter', () => ({
  webhookRateLimiter: (req, res, next) => next()
}));

const mockAddMessage = jest.fn().mockResolvedValue({ id: 'job-1' });
const mockCorrelationInfo = jest.fn();

jest.mock('../../services/messageQueue', () => ({
  addMessage: mockAddMessage
}));

jest.mock('../../services/correlationContext', () => ({
  initContext: (id, metadata) => ({ correlationId: id, metadata }),
  runWithContext: async (context, fn) => fn(),
  logger: { info: mockCorrelationInfo },
  getCorrelationId: () => 'wamid.TEST123',
  setMetadata: jest.fn()
}));

jest.mock('../../services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../../services/chatbot', () => ({ handleMessage: jest.fn() }));
jest.mock('../../services/whatsapp', () => ({ sendButtons: jest.fn() }));
jest.mock('../../services/googleSheets', () => ({}));
jest.mock('../../services/metaCloud', () => ({ downloadMedia: jest.fn() }));
jest.mock('../../services/groqAi', () => ({ transcribeAudio: jest.fn(), normalizeTranscription: jest.fn() }));
jest.mock('../../services/pushNotification', () => ({}));
jest.mock('../../middleware/auth', () => (req, res, next) => next());

describe('Webhook correlation propagation', () => {
  it('queues message with correlationId derived from message id and logs trace', async () => {
    const router = require('../../routes/webhook');
    const app = express();
    app.use(express.json());
    app.use('/api/webhook', router);

    const payload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: 'entry-1',
        changes: [{
          field: 'messages',
          value: {
            contacts: [{ wa_id: '919999999999', profile: { name: 'Test User' } }],
            messages: [{
              id: 'wamid.TEST123',
              from: '919999999999',
              type: 'text',
              text: { body: 'hello' }
            }]
          }
        }]
      }]
    };

    await request(app).post('/api/webhook/meta').send(payload).expect(200);

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(mockAddMessage).toHaveBeenCalledWith(expect.objectContaining({
      messageId: 'wamid.TEST123',
      correlationId: 'wamid.TEST123'
    }));
    expect(mockCorrelationInfo).toHaveBeenCalledWith(
      'Webhook message enqueued',
      expect.objectContaining({ correlationId: 'wamid.TEST123' })
    );
  });
});
