# INTEGRITY VERIFICATION PLAYBOOK

## 1) Message Retry Safety (Queue)
1. Send one inbound Meta message and capture `messageId`.
2. Replay same message payload (same `messageId`) to webhook.
3. Verify queue logs show duplicate/in-progress skip for `msg:<messageId>` and no repeated side effects.

## 2) Cart Mutation Duplicate Safety
1. Trigger an add-to-cart action from WhatsApp.
2. Replay same inbound message with same `messageId` and selection.
3. Verify cart quantity increases only once and logs show cart key dedup behavior.

## 3) Duplicate Checkout Trigger Safety
1. Trigger checkout once from the same cart state.
2. Replay same message/trigger.
3. Verify only one order is created and second trigger is deduplicated.

## 4) Payment Webhook Replay Safety
1. Send one valid `payment.captured` webhook payload.
2. Replay identical payload.
3. Verify order transitions once, duplicate path returns success, and no duplicated payment side effects.

## 5) Queue Retry Non-Reexecution Check
1. Force a transient failure in downstream processing (test path).
2. Allow queue retry.
3. Verify ledger prevents duplicate completed side effects if the first attempt already committed.
