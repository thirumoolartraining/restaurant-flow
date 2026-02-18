const crypto = require('crypto');

function stableHash(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex').slice(0, 16);
}

function inboundMessageKey(messageId) {
  return `msg:${messageId || 'unknown'}`;
}

function cartMutationKey({ customerId, messageId, action, itemId }) {
  return `cart:${customerId || 'unknown'}:${messageId || 'unknown'}:${action || 'unknown'}:${itemId || 'none'}`;
}

function orderCreateKey({ customerId, messageId, cartHash, bucket }) {
  if (messageId) {
    return `orderCreate:${customerId || 'unknown'}:${messageId}`;
  }

  const fallbackHash = cartHash || stableHash(`${customerId || 'unknown'}:${bucket || 'no-bucket'}`);
  return `orderCreate:${customerId || 'unknown'}:${fallbackHash}`;
}

function paymentConfirmationKey({ orderId, paymentId, eventType }) {
  return `payment:${orderId || 'unknown'}:${paymentId || 'unknown'}:${eventType || 'unknown'}`;
}

function outboundNotificationKey({ channel, template, orderId, eventType }) {
  return `notify:${channel || 'unknown'}:${template || 'none'}:${orderId || 'unknown'}:${eventType || 'unknown'}`;
}

module.exports = {
  stableHash,
  inboundMessageKey,
  cartMutationKey,
  orderCreateKey,
  paymentConfirmationKey,
  outboundNotificationKey
};
