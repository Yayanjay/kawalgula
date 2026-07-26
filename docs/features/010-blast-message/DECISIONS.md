# 010 — Blast Message (Broadcast to Opted-In Patients)

## Motivation

Admin needs to send broadcast messages (workshop invitations, training info, promotional material) to DM patients. Messages include text + optional image, with name personalization to avoid WhatsApp spam flags. This is separate from the event-bound TemplateMessage system — each blast is a one-off campaign composed on the fly.

## Design decisions

### Separate Blast model (not extending TemplateMessage)
Blast messages are ad-hoc campaigns, not reusable templates wired to code events. They have their own lifecycle (draft → sending → sent) and per-recipient delivery tracking.

### Recipient selection: all opted-in patients
MVP sends to all patients with `consentStatus = opted_in AND active = true`. No filtering UI. Future versions can add medication/date range filters.

### Send mode: immediate only
No scheduling for MVP. Admin clicks "Kirim" and messages fire immediately with a 3-second delay between each to avoid WhatsApp rate-limiting.

### Image: optional
Blasts can be text-only or text + image. Image uploaded via a dedicated upload endpoint, stored on local filesystem, served as static file. WAHA fetches the image via Docker internal URL (`http://api:3000/uploads/...`).

### Delay: 3 seconds between sends
Conservative rate to avoid WhatsApp flagging. ~20 messages/minute. Configurable via `GeneralParameter` later.

## Data model

```prisma
enum BlastStatus { draft, sending, sent, cancelled }

enum BlastRecipientStatus { pending, sent, failed }

model Blast {
  id              String       @id @default(cuid())
  title           String
  body            String
  mediaUrl        String?      @map("media_url")
  mediaType       String?      @map("media_type")
  status          BlastStatus  @default(draft)
  scheduledAt     DateTime?    @map("scheduled_at")
  sentAt          DateTime?    @map("sent_at")
  totalRecipients Int          @default(0) @map("total_recipients")
  successCount    Int          @default(0) @map("success_count")
  failCount       Int          @default(0) @map("fail_count")
  createdById     String       @map("created_by_id")
  createdAt       DateTime     @default(now()) @map("created_at")
  updatedAt       DateTime     @default(now()) @updatedAt @map("updated_at")

  recipients BlastRecipient[]
  createdBy  Admin           @relation(fields: [createdById], references: [id])

  @@map("blasts")
}

model BlastRecipient {
  id            String                @id @default(cuid())
  blastId       String                @map("blast_id")
  patientId     String                @map("patient_id")
  patientName   String                @map("patient_name")
  waNumber      String                @map("wa_number")
  status        BlastRecipientStatus  @default(pending)
  wahaMessageId String?               @map("waha_message_id")
  error         String?
  sentAt        DateTime?             @map("sent_at")
  createdAt     DateTime              @default(now()) @map("created_at")

  blast   Blast   @relation(fields: [blastId], references: [id], onDelete: Cascade)
  patient Patient @relation(fields: [patientId], references: [id], onDelete: Cascade)

  @@index([blastId])
  @@index([patientId])
  @@map("blast_recipients")
}
```

New value added to existing `OutboundKind`: `blast`.

## API contract

### Upload image

`POST /api/v1/uploads/image`
- Content-Type: multipart/form-data, field `file`
- Accepts: image/png, image/jpeg, image/webp
- Max size: 5MB
- Response: `{ url: "/uploads/<timestamp>-<random>.jpg" }`

### CRUD blasts

| Method | Route | Auth | Body | Response |
|--------|-------|------|------|----------|
| POST | `/api/v1/blasts` | JWT | `{ title, body, mediaUrl?, mediaType? }` | `{ data: Blast }` |
| POST | `/api/v1/blasts/list` | JWT | `PaginationRequest` | `{ data: Blast[], pagination }` |
| GET | `/api/v1/blasts/:id` | JWT | — | `{ data: Blast & { recipients } }` |
| POST | `/api/v1/blasts/:id/send` | JWT | — | `{ data: Blast }` (status=sending) |
| DELETE | `/api/v1/blasts/:id` | JWT | — | `{ data: { message } }` |

### Send flow

1. Load blast, validate `status == draft`
2. Set `status = sending`
3. Query `Patient.findMany({ where: { consentStatus: opted_in, active: true } })`
4. Bulk-create `BlastRecipient` rows (pending)
5. Loop recipients with 3s delay:
   - Render body via `renderTemplate()` with `{ name, waNumber }`
   - If `mediaUrl`: `wahaClient.sendImage(chatId, imageUrl, renderedBody)`
   - Else: `wahaClient.sendText(chatId, renderedBody)`
   - On success: update recipient `status=sent, wahaMessageId, sentAt`
   - On failure: update recipient `status=failed, error`
   - Create `OutboundMessage(kind=blast, payload, wahaMessageId)`
6. Update blast `successCount, failCount, sentAt, status=sent`

## Edge cases

- **No opted-in patients**: `POST /send` returns error "Tidak ada pasien yang aktif dan sudah setuju."
- **Blast already sent**: `POST /send` on non-draft blast returns `BadRequest("Broadcast sudah dikirim")`.
- **WAHA failure mid-blast**: blast remains `sending`, successful recipients are marked `sent`, failed ones are `failed`. Admin can inspect per-recipient status.
- **Upload fails**: handled by multer, returns appropriate HTTP error.
- **Image too large**: 5MB limit enforced by multer.
- **Unsupported image type**: rejected by multer file filter.
- **Personalization**: uses existing `renderTemplate()` from `@kawalgula/shared`. Only `{{name}}` is guaranteed to be available. If body uses other variables, they remain unsubstituted.

## Anti-ban

- 3-second delay between WAHA sends
- Every message includes `{{name}}` in body — no generic bulk messages
- Only sent to opted-in patients (explicit consent)

## Future (out of scope)

- Scheduled sends
- Recipient filtering (medication, date range)
- Template-based blasts (reusable)
- Analytics dashboard
