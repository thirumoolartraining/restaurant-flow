const ledgerState = new Map();

const mockLedger = {
  async tryStart(key) {
    const entry = ledgerState.get(key);
    if (entry?.status === 'processed') return { status: 'DUPLICATE_PROCESSED', key };
    if (entry?.status === 'processing') return { status: 'IN_PROGRESS', key };
    ledgerState.set(key, { status: 'processing' });
    return { status: 'STARTED', key };
  },
  async markProcessed(key, metadata = {}) {
    ledgerState.set(key, { status: 'processed', metadata });
  },
  async markFailed(key, metadata = {}) {
    ledgerState.set(key, { status: 'failed', metadata });
  }
};

const mockCreatedOrders = [];
const mockCustomer = {
  _id: 'cust-2',
  phone: '918888888888',
  cart: [{ menuItem: 'itemA', quantity: 1, price: 100 }],
  pendingOrderId: null,
  conversationState: { currentStep: 'select_payment_method' }
};

let mockMessageId = 'wamid.checkout.1';

jest.mock('../../services/chatbot', () => ({
  handleMessage: jest.fn(async (phone, message, messageType, selectedId) => {
    if (selectedId === 'checkout' && !mockCustomer.pendingOrderId) {
      const orderId = `ORD-${mockCreatedOrders.length + 1}`;
      mockCreatedOrders.push({ orderId, customerId: mockCustomer._id });
      mockCustomer.pendingOrderId = orderId;
    }
  })
}));

jest.mock('../../services/domains/index', () => ({ hasDomain: () => true, hasAction: () => true }));
jest.mock('../../models/Customer', () => ({ findOne: jest.fn(async ({ phone }) => (phone === mockCustomer.phone ? mockCustomer : null)) }));
jest.mock('../../services/conversationState', () => ({ getState: (cust) => cust.conversationState }));
jest.mock('../../services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../../services/correlationContext', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  getCorrelationId: () => 'corr-order-test',
  setMetadata: jest.fn(),
  getMetadata: (k) => (k === 'messageId' ? mockMessageId : null)
}));
jest.mock('../../services/idempotency/idempotencyLedger', () => ({
  STATUS: { STARTED: 'STARTED', DUPLICATE_PROCESSED: 'DUPLICATE_PROCESSED', IN_PROGRESS: 'IN_PROGRESS' },
  getIdempotencyLedger: () => mockLedger
}));

describe('Integrity - duplicate checkout/order creation', () => {
  beforeEach(() => {
    ledgerState.clear();
    mockCreatedOrders.length = 0;
    mockCustomer.pendingOrderId = null;
    mockMessageId = 'wamid.checkout.1';
  });

  it('creates a single order for same checkout trigger and records processed key', async () => {
    const router = require('../../services/chatbotRouter');

    await router.handleMessage(mockCustomer.phone, 'checkout', 'button', 'checkout', 'Test');
    await router.handleMessage(mockCustomer.phone, 'checkout', 'button', 'checkout', 'Test');

    expect(mockCreatedOrders).toHaveLength(1);
    expect(mockCustomer.pendingOrderId).toBe(mockCreatedOrders[0].orderId);

    const expectedKey = 'orderCreate:cust-2:wamid.checkout.1';
    expect(ledgerState.get(expectedKey)?.status).toBe('processed');
  });
});
