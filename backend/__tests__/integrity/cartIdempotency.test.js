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

const mockCustomer = {
  _id: 'cust-1',
  phone: '919999999999',
  cart: [],
  conversationState: { currentStep: 'viewing_cart' }
};

let mockMessageId = 'wamid.cart.1';

jest.mock('../../services/chatbot', () => ({
  handleMessage: jest.fn(async (phone, message, messageType, selectedId) => {
    if (selectedId === 'add_item1') {
      const existing = mockCustomer.cart.find((item) => item.menuItem === 'item1');
      if (existing) existing.quantity += 1;
      else mockCustomer.cart.push({ menuItem: 'item1', quantity: 1 });
    }
  })
}));

jest.mock('../../services/domains/index', () => ({ hasDomain: () => true, hasAction: () => true }));
jest.mock('../../models/Customer', () => ({ findOne: jest.fn(async ({ phone }) => (phone === mockCustomer.phone ? mockCustomer : null)) }));
jest.mock('../../services/conversationState', () => ({ getState: (cust) => cust.conversationState }));
jest.mock('../../services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../../services/correlationContext', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  getCorrelationId: () => 'corr-cart-test',
  setMetadata: jest.fn(),
  getMetadata: (k) => (k === 'messageId' ? mockMessageId : null)
}));
jest.mock('../../services/idempotency/idempotencyLedger', () => ({
  STATUS: { STARTED: 'STARTED', DUPLICATE_PROCESSED: 'DUPLICATE_PROCESSED', IN_PROGRESS: 'IN_PROGRESS' },
  getIdempotencyLedger: () => mockLedger
}));

describe('Integrity - duplicate cart mutation', () => {
  beforeEach(() => {
    mockCustomer.cart = [];
    ledgerState.clear();
    mockMessageId = 'wamid.cart.1';
  });

  it('does not double-add item for same message trigger and records processed ledger key', async () => {
    const router = require('../../services/chatbotRouter');

    await router.handleMessage(mockCustomer.phone, 'add to cart', 'button', 'add_item1', 'Test');
    await router.handleMessage(mockCustomer.phone, 'add to cart', 'button', 'add_item1', 'Test');

    expect(mockCustomer.cart).toHaveLength(1);
    expect(mockCustomer.cart[0].menuItem).toBe('item1');
    expect(mockCustomer.cart[0].quantity).toBe(1);

    const expectedKey = 'cart:cust-1:wamid.cart.1:add:item1';
    expect(ledgerState.get(expectedKey)?.status).toBe('processed');
  });
});
