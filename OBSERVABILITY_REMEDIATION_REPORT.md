# OBSERVABILITY REMEDIATION REPORT

## Scope
Implemented Phase 1 P0 observability items with safe defaults for disconnected/local environments.

## Before vs After
- **Before:** webhook processing had no guaranteed per-message correlation context and directly invoked chatbot processing, making cross-boundary tracing hard.
- **After:** each inbound Meta message gets a deterministic `correlationId` (prefers Meta message id), which is propagated into queue payload, queue worker context, and downstream router logs.
- **Before:** Razorpay webhook replay could re-enter handlers without explicit idempotency ledger.
- **After:** explicit payment webhook idempotency guard with Mongo-backed (when available) or in-memory fallback store, replay-safe duplicate short-circuit, and structured duplicate logs.
- **Before:** alerting had send primitives but no minimal pluggable monitor loop for threshold checks.
- **After:** pluggable notifier interface (Slack/Email with noop fallback) and feature-flagged monitor scheduler for queue depth, payment failures, and external API failures.

## Files Changed
- `backend/routes/webhook.js`
- `backend/services/messageQueue.js`
- `backend/services/chatbotRouter.js`
- `backend/routes/payment.js`
- `backend/services/paymentWebhookIdempotencyStore.js`
- `backend/services/alerting/alertService.js`
- `backend/services/alerting/slackNotifier.js`
- `backend/services/alerting/emailNotifier.js`
- `backend/services/alerting/noopNotifier.js`
- `backend/services/alerting/monitors.js`
- `backend/server.js`
- `backend/__tests__/api/webhookCorrelation.test.js`
- `backend/__tests__/api/paymentWebhookIdempotency.test.js`

## Correlation Flow End-to-End
1. `/api/webhook/meta` parses each inbound message from batched entries.
2. Correlation context is initialized per message.
3. `correlationId` derivation priority:
   - Meta message id (`message.id`)
   - status id
   - metadata phone_number_id / entry id fallback
   - generated UUID-like fallback.
4. Queue payload includes `correlationId` and webhook metadata.
5. Queue worker re-initializes context with `correlationId` and logs processing attempts with context metadata.
6. Downstream router logs include `correlationId` and selected domain.

## Razorpay Webhook Idempotency
1. Build deterministic key from event type + payload entity/payment identifiers.
2. Check/mark processing in idempotency store.
3. If duplicate, return success (`200`, `status: ok`) without side effects.
4. First process path continues unchanged business transitions.
5. On completion, mark key as `processed` with metadata (`webhookId`, `paymentId`, `eventType`, `actionTaken`).
6. Store backend:
   - Mongo collection when connected.
   - In-memory fallback for disconnected env/tests.

## Alerting Foundation
- New `alertService` abstraction delegates to notifiers.
- Slack/email notifiers auto-noop if env config absent.
- Monitors (feature-flagged by `ENABLE_ALERT_MONITORS=true`):
  1. `queueDepthMonitor` (`QUEUE_ALERT_THRESHOLD`)
  2. `paymentFailureMonitor` (`PAYMENT_FAIL_RATE_THRESHOLD`)
  3. `externalApiMonitor` (`EXTERNAL_API_FAIL_THRESHOLD`)
- When disabled, monitors still run a single dry-run and emit debug logs for “would alert” visibility.

## Post-Merge Verification Overview
See `VERIFICATION_PLAYBOOK.md` for runtime procedures in connected environments.
