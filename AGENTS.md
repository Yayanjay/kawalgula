# AGENTS.md — kawalgula

Puskesmas diabetes mellitus (DM) medication reminder + consumption tracking system. Admins use a web dashboard; patients interact via WhatsApp. Greenfield repo.

## Before you start
- Read `docs/architecture/REQUIREMENTS.md` and `docs/architecture/PLANS.md` before making any architectural decisions.
- Read `docs/engineering/CONVENTIONS.md`, `docs/engineering/RULES.md`, and `docs/engineering/GIT_FLOW.md` before writing any code.
- Read `docs/features/<NNN>-<feature-name>/DECISIONS.md` for the specific feature you are working on, if it exists.
- Do not assume conventions from other projects — always consult the docs first.

## Architecture (locked decisions)
- **Stack**: NestJS (TS) API + React/Vite (TS) admin dashboard + Prisma + PostgreSQL (prod)/SQLite (dev) + Redis + BullMQ + WAHA, bundled via Docker Compose, Caddy reverse proxy with TLS on homelab.
- **Single-tenant for MVP.** No `Puskesmas` tenant scoping yet.
- **Timezone**: Asia/Jakarta (WIB). Store DB timestamps as UTC, render in WIB. Reminder scheduling logic must convert WIB→UTC before comparing with DB.
- **TZ library**: `luxon` (in `apps/api`). Never use `new Date().setHours()` — it depends on system timezone. Always go through `DateTime.now().setZone("Asia/Jakarta")`.
- **Patient identity**: WhatsApp number only, registered by admin. No patient password/login/NIK/SatuseHAT in MVP. Unique on `Patient.waNumber`.

## WhatsApp gateway — WAHA (not the sibling `whatsapp-gateway` project)
- Self-hosted via `devlikeapro/waha` Docker image in the same compose stack. Mount `.sessions` volume (`./.sessions:/app/.sessions`) so re-pairing is only needed on number unlink.
- Do NOT use Fonnte or the sibling `/Users/zayyanabdillah/project/software/whatsapp-gateway` repo as reference — different project.
- Outbound reminder: `POST /api/sendButtons` with two `type:"reply"` buttons (`Sudah minum`, `Belum`). Inbound reply arrives via `/webhooks/waha` webhook config; button tap = `message.type=="button"` with `message.buttonText`.
- WAHA session must be configured at startup with `webhooks[].events:["message"]` pointing to the api's `/webhooks/waha` endpoint.

## Opt-in flow (patient consent is gating)
- Admin creates patient → system auto-queues opt-in send (no manual trigger needed). Dashboard also has a per-row "Re-send opt-in" action for retries.
- Patient consents via the enrollment template's buttons ("Setuju" / "Nanti saja") or free text matching `setuju`. Store `Patient.consentStatus` (`pending|opted_in|opted_out`) and `consentAt`.
- **Reminder seeder only generates `Reminder` rows after `consentStatus=opted_in`.** Never send reminders to a `pending`/`opted_out` patient.

## Missed reminder rule (non-obvious)
- A `Reminder` becomes `missed` exactly when the **next scheduled dose** for the same `Medication` fires AND the prior `Reminder` still has no `ConsumptionLog`. No fixed-hours cap.
- Implementation requires querying the chronologically-next `Reminder` per `medicationId`; once its `scheduledAt <= now()`, mark the prior one missed and write `ConsumptionLog(source=system_missed, status=missed)`.
- For last-dose-of-day / once-daily meds, the next-day reminder is the trigger — there is NO same-day missed marking for those.

## Free-text consumption parsing (MVP, keyword match only)
- `sudah|selesai|udah|minum` → taken
- `belum|lewati|skip` → skipped
- else → reply with `TemplateMessage(type=usage_hint)`
- Do NOT implement fuzzy/NLP in MVP.

## Admin auth
- JWT (1h access + 7d refresh in httpOnly cookie). Single admin for MVP but `Admin` table has `role` typed for later multi-admin.
- Passwords bcrypt-hashed via NestJS.

## Reminder lifecycle states
`pending` → `sent` → `confirmed` (patient took/skipped) OR `missed` (next dose fired) OR `failed` (max WAHA send retries).

## Template messages (admin-crud)
Type enum: `enrollment`, `reminder`, `optin_confirm`, `usage_hint`, `already_opted_in`, `confirmation`. Schema `TemplateMessage(type, key unique, title, body)`. Render with patient/medication variables — keep template-renderer in `packages/shared`.

## Monorepo layout (when scaffolded)
```
docker-compose.yml
apps/api        # NestJS: modules auth, admin, patients, meds, templates, reminders, consumption, waha-webhook, waha-client, queue
apps/web        # React+Vite admin (TanStack Query + shadcn/ui)
packages/prisma # schema.prisma, migrations, seed.ts
packages/shared # DTOs, enums, template-renderer, constants
caddy/Caddyfile
```
- BullMQ workers run inside the api process for MVP (no separate worker service in compose).
- Dashboard uses shadcn/ui (already in codebase convention direction); TanStack Query for server state.

## Env / data source
- `DATABASE_URL` switches between SQLite (dev) and PostgreSQL (prod). Single `prisma/schema.prisma` — no per-provider sharding.
- WAHA reachable inside compose as `http://waha:3000`; webhook URL on WAHA must point to the public/homelab host (not `localhost`) so the inbound webhook resolves.

## Conventions
- Comments only when explicitly requested by the user. Match existing NestJS/React module patterns when scaffolding.
- Indonesia-language user-facing strings; code/identifiers in English.
- No git commits unless user explicitly asks.

## Don't
- Don't introduce patient auth, multi-tenant, SatuseHAT integration, analytics, broadcast, fuzzy NLP, or photo/OCR — all explicitly out of MVP scope.

## Feature docs workflow
- Every feature must have a numbered feature doc before implementation: `docs/features/<NNN>-<feature-name>/DECISIONS.md`.
- Feature docs own: motivation, API contract, data model, edge cases, and decisions made.
- Do not start implementation without approved feature doc.

## Git conventions
- Trunk-based from `main`. Keep `main` deployable.
- Branch naming: `feature/NNN-short-name`, `fix/NNN-short-name`, `docs/topic`, `chore/topic`.
- Conventional commits: `feat:`, `fix:`, `docs:`, `chore:`, `test:`.
- PRs: scoped to one feature, include feature doc updates, migrations, and tests.

## API conventions
- Response envelope: all responses use `{ code, message, data, pagination? }`. `code` matches HTTP status.
- Paginated list/search endpoints must use `POST`, not `GET`. Route: `POST /api/v1/<resource>/list`.
- Pagination request body:
  ```json
  {
    "page": 1,
    "size": 10,
    "search": { "key": ["name"], "value": "john" },
    "sort": [{ "key": "created_at", "direction": "DESC" }]
  }
  ```
- `search.key` and `sort[].key` must be whitelisted per endpoint. `sort[].direction` only accepts `ASC` or `DESC`.
- Default `page=1`, `size=10`. Set a max `size` per endpoint.

## Engineering rules
- Read the relevant feature doc before implementing or changing a feature.
- Do not add framework, database, queue, or auth technology changes without recording the decision in a feature doc.
- This project is a single monolith for MVP. Do not create separate services.
- Update this AGENTS.md with the exact setup, run, lint, test, and migration commands when they become available.
