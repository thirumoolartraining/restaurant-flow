# VERIFICATION PLAYBOOK

## 1) CorrelationId Propagation (Connected Meta Environment)
1. Enable normal backend logs.
2. Send a real WhatsApp message to the bot.
3. Verify logs sequence contains same `correlationId` in:
   - webhook parsing log
   - queue enqueue log
   - queue worker processing log
   - downstream routing/completion log
4. Repeat with batched webhook payload (multiple messages in one delivery) and verify each message has its own `correlationId`.

Expected:
- `correlationId` equals Meta `message.id` when available.
- Queue job payload includes `correlationId`.

## 2) Razorpay Replay Safety
1. Capture one real Razorpay webhook payload + headers from wired environment.
2. POST it once to `/api/payment/razorpay-webhook`.
3. Re-POST identical payload immediately.
4. Validate:
   - Second call returns success (`status: ok`).
   - Logs show `isDuplicate: true` and `actionTaken: skipped_duplicate`.
   - Order status/refund status unchanged on replay.
   - No duplicate customer/admin notifications are triggered.

## 3) Queue Backlog Alert Monitor
1. Set env:
   - `ENABLE_ALERT_MONITORS=true`
   - `QUEUE_ALERT_THRESHOLD=<low value e.g. 1>`
   - optional `ALERT_MONITOR_INTERVAL_MS=10000`
2. Create enough queued inbound messages to exceed threshold.
3. Verify alert log and notifier delivery attempts.
4. If Slack webhook configured, verify Slack message arrives.

## 4) Payment Failure Rate Monitor
1. Set `PAYMENT_FAIL_RATE_THRESHOLD` to a low value (e.g., `0.1`).
2. Generate payment failure events in a test path.
3. Confirm monitor computes interval failure rate and triggers alert when threshold breached.

## 5) External API Failure Monitor
1. Set `EXTERNAL_API_FAIL_THRESHOLD` low.
2. Induce controlled failures (WhatsApp/Razorpay test mode).
3. Confirm alert dispatch and structured monitor logs.

## Recommended Rollback Toggle
- Disable monitors immediately by setting `ENABLE_ALERT_MONITORS=false`.
