# 009 — Reminder Retry on "Belum"

## Motivation
When a patient responds "belum" (not yet) to a reminder, the current system marks the reminder as `confirmed` + `skipped` — terminating it. This defeats the clinical goal: the patient still hasn't taken the medication and needs continued reminding.

This feature adds configurable retry logic: "belum" keeps the reminder alive, re-sends it after an interval, and only marks as skipped after exhausting the maximum retries.

## Behavior

### "Belum" response (retry path)
1. Find the most recent `status: "sent"` reminder for the patient.
2. Read `reminder_max_retries` and `reminder_retry_interval_minutes` from `GeneralParameter`.
3. If `reminder.retryCount < maxRetries`:
   - Increment `retryCount` by 1.
   - Set `nextRetryAt = now + intervalMinutes`.
   - Keep `status = "sent"`.
   - Do NOT create a `ConsumptionLog`.
   - Reply: *"Tercatat. Kami akan mengingatkan lagi nanti."*
4. If `retryCount >= maxRetries` (retries exhausted):
   - Set `status = "confirmed"`.
   - Create `ConsumptionLog(status: "skipped", source: "free_text" | "button")`.
   - Reply: *"Baik, dicatat sebagai lewati untuk jadwal ini."*

### "Sudah" response (unchanged)
- Same as current: mark reminder `confirmed`, create `ConsumptionLog(status: "taken")`, reply *"Tercatat. Terima kasih."*

### Pre-reminder chat (no active `sent` reminder)
- Previously: logged orphan `ConsumptionLog` + acknowledgment.
- Now: reply with `usage_hint` template. No log created.

### Retry dispatch (re-sending)
- `dispatchReminders()` additionally queries `status: "sent", nextRetryAt: { lte: now }, retryCount: { lt: maxRetries }`.
- Sends the same `reminder` template via WAHA.
- On success: update `sentAt`, `wahaMessageId`, clear `nextRetryAt = null`.
- On failure: mark `status = "failed"`.
- Creates `OutboundMessage` for each send attempt.

## Missed marker interaction
- Reminders undergoing retry have **no** `ConsumptionLog` (it's only created on "sudah" or retry exhaustion).
- The missed marker (`markMissed()`) checks for `ConsumptionLog` → none exists → it will mark the reminder as `missed` when the next scheduled dose fires.
- This is correct clinically: if the next dose time arrives and the patient still hasn't confirmed, the previous dose is missed regardless of retry state.

## Data model

### New model: `GeneralParameter`
| Column | Type | Description |
|--------|------|-------------|
| id | String (cuid) | PK |
| key | String (unique) | Parameter key |
| value | String | Parameter value (always string, parsed by consumer) |
| name | String? | Human-readable label |
| created_at / updated_at | DateTime | Timestamps |

Default rows seeded:

| key | value | name |
|-----|-------|------|
| `reminder_max_retries` | `3` | Maksimal percobaan ulang pengingat |
| `reminder_retry_interval_minutes` | `30` | Interval percobaan ulang (menit) |

### Fields added to `Reminder`

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| retry_count | Int | 0 | Number of "belum" responses received |
| next_retry_at | DateTime? | null | When the dispatcher should re-send. Null = no pending retry |

## Edge cases
- **Patient says "belum" before the initial retry send**: resets `nextRetryAt` to `now + interval`. Timer restarts.
- **WAHA fails during retry send**: reminder marked `failed`. Admin can use manual send.
- **Retry interval smaller than dispatch cycle (60s)**: not possible since interval is in minutes. Dispatcher picks up the retry within 60s of `nextRetryAt`.
- **Parameters changed mid-flight**: the dispatcher and webhook read fresh values from DB on each invocation.
- **Pre-reminder "belum"**: treated same as any pre-reminder message (no active sent reminder) → `usage_hint`.
