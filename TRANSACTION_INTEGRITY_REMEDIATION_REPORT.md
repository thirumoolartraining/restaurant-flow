# TRANSACTION INTEGRITY REMEDIATION REPORT

## Implemented Idempotency Keys
- Inbound message event: `msg:<messageId>`
- Cart mutation event: `cart:<customerId>:<messageId>:<action>:<itemId>`
- Order create trigger: `orderCreate:<customerId>:<messageId>` (or hash fallback)
- Payment confirmation: `payment:<orderId>:<paymentId>:<eventType>`
- Outbound notification: `notify:<channel>:<template>:<orderId>:<eventType>`

## Protected Flows
1. **Inbound WhatsApp processing**
   - Queue worker now runs a message-level idempotency check before chatbot processing.
   - Duplicate or in-progress message retries are logged and skipped.
2. **Cart mutation retries**
   - Router adds cart-intent idempotency for add/remove/clear-like triggers using message context.
3. **Order creation trigger retries**
   - Router adds checkout trigger deduplication using order-create key.
4. **Payment confirmation collisions**
   - Payment webhook adds business-level payment transition guard key in addition to webhook replay key.
5. **Notification dedup baseline**
   - Notification key helpers and ledger are available and integrated in payment webhook path where event-level dedup applies.

## Atomic / Conditional Safety Applied
- Message processing mutations are guarded with `tryStart -> markProcessed/markFailed`.
- Payment confirmation applies conditional no-op for already-paid orders and dedicated business idempotency key.
- Ledger uses Mongo unique index insert (when connected) for atomic first-writer wins.

## Remaining Risk Notes
- Some legacy deep chatbot cart/order mutation internals still rely on legacy save flows; duplicate prevention currently sits at router/queue boundaries.
- Full per-notification ledger coverage across all non-payment event channels can be expanded in subsequent hardening.
