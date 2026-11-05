# What you've built

A single-service ecommerce API organised Laravel-style (routes → controllers → services → validations → middleware). Below is what actually exists in code, by capability.

---

## Auth & sessions

**Hybrid JWT + server-side session.** The token holds `sub` (userId) and `jti` (sessionId); every protected request looks the session row up and checks `revokedAt` / `expiresAt` / `userId` match — so logout is truly revocable even while the JWT is still cryptographically valid.

- `register` hashes with bcrypt (cost 12), creates the user, issues a session, and queues a `register` email job.
- `login` loads with `omit: { passwordHash: false }` (the global Prisma `omit` hides it everywhere else), compares, issues a session/token.
- `logout` sets `session.revokedAt = now()`.
- `me` is a session-refresh — issues a fresh session + token.
- `change-password` verifies current password, writes a new hash.
- `reset-password` is enumeration-safe — always returns 200. If the email exists, it deletes outstanding tokens and inserts a single new one (sha256 of a 32-byte hex random), then queues a `password-reset` job.
- `confirm-password-reset` verifies by hash + unexpired, updates password, deletes the token, then queues a `password-reset-success` job.

**Protected-handler composition** (`src/middleware/protectedHandler.ts`): `protectedHandler(handler, ...gates)` runs `requiresAuth`, then chains additional middleware (typically `requiresOwnership`), then the handler. A custom type guard (`isAuthenticatedRequest`) narrows the request type to `AuthenticatedRequest` once `userId`/`sessionId` are attached.

**Guest-only routes** (`requiresGuest`) block authenticated users from register/login/reset.

**OAuth** — Passport strategies for Google and GitHub. Signed state via `SignedStateStore` (JWT with `purpose:"oauth-state"` and provider claim, 10-minute expiry) instead of Passport's default in-memory store, so state survives across instances. Linked accounts live in a separate `oauth_accounts` table; the first OAuth sign-in auto-creates a user if the email is verified and unused, otherwise it refuses to silently merge. A shared `oauthCallback` factory issues a session and redirects to `${FRONTEND_URL}/oauth/callback?token=...`. Scaffolds exist for Facebook/Apple/Microsoft but no strategies are wired.

---

## Catalog: products, categories, images

- **Products**: CRUD with a paginated search index. `createSlug` appends `crypto.randomUUID()` so slug collisions are impossible — practical but unreadable. Ownership-gated mutations.
- **Categories**: CRUD. (The handlers parse `{id}` from params while the routes use `:name`; that mismatch is still in the code.)
- **Images**: polymorphic uploads. One `images` table with `imageableType ∈ {POST, PRODUCT, CATEGORY}` + `imageableId`, unique on `[imageableType, imageableId, userId]` so one user can only attach one image per subject. Multer handles disk storage, allowlists MIME types (images + PDF), size cap from env. After the DB insert, `resolvePolymorphic` reads the parent record in the same transaction — keeps orphan uploads impossible. If the DB write throws, the on-disk file is unlinked.

---

## Cart → Order (the real work)

**Cart** is one row per user (`@unique userId`), items are upserted by `[cartId, productId]` so adding the same product just updates quantity.

**Placing an order** (`src/services/order.service.ts`) is the most careful piece of code in the project. The whole thing runs in a single `prisma.$transaction`:

1. Load the cart with non-deleted items.
2. Load every referenced product once.
3. Classify each cart item: missing product, deleted, inactive, invalid quantity, insufficient stock, or ok. Any invalid items → `AppError(422, "...", { items: InvalidOrderItem[] })` with a per-item `reason` and (when relevant) the current `availableStock`.
4. **Reserve stock atomically**: for each ok item, `product.updateMany({ where: { id, isActive, deletedAt:null, stock: { gte: n } }, data: { stock: { decrement: n } } })`. If `count === 0`, re-read the product and throw `AppError(409, "Cart items changed while the order was being placed.", {...})`. This is a compare-and-swap — it never leaks a negative stock under concurrent placements.
5. Create the order + items, **snapshotting** `productName` and `unitPrice` so later edits don't rewrite history.
6. Delete the cart items.

**Idempotent order placement** is layered on top: `placeOrderIdempotently(userId, key)` reserves an `IdempotencyKey` row using `requestHash = sha256("place-order")` (constant, since the operation reads server state), runs the transaction, then stamps `status=COMPLETED, responseStatus=201, responseBody=<order json>`. A completed row with a valid uuid `id` is replayable; expired rows are reclaimable via a CAS `updateMany` guarded by `expiresAt <= now`. Failed attempts flip the row to `FAILED`, forcing callers to use a new key.

---

## Payments

The payment subsystem spans five files and is the newest work on `main`.

**Gateway abstraction** (`src/gateways/index.ts` + `src/types/payment.ts`). Each provider implements:

```
initializePayment(input) → { authorizationUrl, providerReference, raw }
verifyPayment(reference) → { status, amount, currency, providerReference, raw }
parseWebhook(rawBody, headers) → WebhookEvent
refundPayment?(input)   → { providerReference, raw }
```

Status strings are normalized (`success|failed|pending|abandoned`) before the service maps them onto the `PaymentStatus` enum. Gateways are only registered if their env secrets are present; calling an unconfigured provider throws `AppError(503)`.

- **Paystack**: `/transaction/initialize`, `/transaction/verify/:ref`, `/refund`; webhook verified via `HMAC-SHA512(secretKey, body)` with `timingSafeEqual`.
- **Flutterwave**: converts minor ↔ major units at the boundary (`amount/100` on send, `amount*100` on receive); webhook verified by constant-time compare of `verif-hash` to a configured shared secret.
- **Stripe**: Checkout Sessions — `initializePayment` builds a single-line-item session, `verifyPayment` uses `/checkout/sessions/search?query=client_reference_id:"..."`, `refundPayment` requires a stored `payment_intent`. Webhook signature parses the `t=`/`v1=` pairs, checks `|now-t| ≤ 5min`, then HMAC-SHA256 over `${t}.${body}`.

**Initialize** (`src/services/payment.service.ts` → `initializePayment` + `initializePaymentIdempotently`):

1. Require an `Idempotency-Key` header (1–255 chars). Hash the payload as `sha256({provider, orderId})` so retries with the same key but different params are rejected with 409.
2. Reserve the idempotency row (same CAS pattern as orders; successful init responses are replayable only if the stored JSON has `authorizationUrl` + `reference` + `payment`).
3. Load the order, verify ownership and `status === PENDING`.
4. Create a local `Payment` row with a generated `pay_<base36ts>_<rand>` reference, in `PENDING`.
5. Call the gateway; on success stamp `providerReference` + `rawInit`. On gateway throw, Payment → `FAILED`, idempotency → `FAILED`.

**Verify**: short-circuits if already `SUCCESS`, otherwise calls the gateway and routes through `applyPaymentOutcome`.

**applyPaymentOutcome** (transactional, used by verify AND webhook) is the integrity core:

- If the gateway reports `SUCCESS` but the amount or currency disagree with the stored Payment, **downgrade to `FAILED`** — defends against misrouted callbacks and tampered payloads.
- Update status + `providerReference` + `rawVerify`.
- If this is the `PENDING → SUCCESS` transition and the payment has an order, flip the `Order` to `PAID`.
- On that same transition, write a double-entry ledger row (`LedgerEntryType.PAYMENT`, `CREDIT`). Unique on `[type, reference]` means a reconcile + webhook arriving together can't double-book — P2002 is swallowed.

**Webhook pipeline**:

- `paymentWebhookRouter` is mounted **before** `express.json`, using `express.raw({ type: '*/*', limit: '1mb' })`. This is the one middleware ordering constraint that actually matters — HMACs are computed on the exact bytes.
- `processWebhook` verifies the signature, upserts a `PaymentWebhookEvent` on `(provider, eventId)` — P2002 means we've seen it, return quietly — then re-enters `applyPaymentOutcome`.
- There's a typed `EventEmitter` (`src/webhooks/payment.webhooks.ts`) with `payment.success|failed|abandoned|pending|refunded` events ready for observers (receipt mail, fulfillment, stock release). It is **defined but not fired** — the service does its bookkeeping inline. Future side effects plug in at `registerPaymentWebhookObservers()`.

**Refund**:

- Ownership check, payment must be `SUCCESS`, amount defaults to full, must lie in `(0, payment.amount]`.
- Gateway must implement `refundPayment` (it's optional on the interface).
- Transactional: Payment → `REFUNDED`, Order → `REFUNDED` (if any), and a `REFUND / DEBIT` ledger row with `reference = <original>:refund:<providerReference>` (so you can't double-book a specific refund either).

**Reconciler** (`src/jobs/scheduler.ts` + `reconcilePendingPayments`):

- `node-cron` job (`PAYMENT_RECONCILE_CRON`, default `*/5 * * * *`), validated at boot.
- Guarded by an in-process `reconcileInFlight` flag.
- Each tick scans up to 100 oldest `PENDING` payments with `createdAt ≤ now − CHECK_AFTER_MS`:
  - older than `ABANDON_AFTER_MS` → mark `ABANDONED`;
  - otherwise re-run `verifyPayment`, swallow errors (next tick will retry).

**Rate limits** (`src/middleware/rateLimiter.ts`) are per-user (`user:<id>` fallback to IP):

- `/api` global: 100 / 15 min.
- `paymentWriteRateLimiter`: 10 / min (initialize, refund).
- `paymentReadRateLimiter`: 30 / min (verify).

---

## Idempotency pattern (shared)

Both orders and payments implement the same four-state protocol against the `idempotency_keys` table:

| Stored state | Action |
|---|---|
| not present | create `IN_PROGRESS`, do the work, finalize `COMPLETED`/`FAILED` |
| `IN_PROGRESS` + same hash | 409 "still in progress" |
| `IN_PROGRESS` + expired | CAS-reclaim (`updateMany` guarded by `expiresAt ≤ now`) → retry |
| `IN_PROGRESS` + different hash | 409 "used with different details" |
| `COMPLETED` + same hash + replayable body | replay stored response verbatim |
| `COMPLETED` + same hash + unreplayable | 500 "stored response invalid" |
| `FAILED` | 409 "previous attempt failed; use a new key" |

Hash of the intent is stored on the row so a retry with the same key but different payload can be caught. A generic GC isn't implemented — rows are naturally recycled by the expiry CAS during reservation.

---

## Background jobs

A single Redis connection (ioredis, `maxRetriesPerRequest: null`) backs BullMQ. One queue (`email`) with three retries, exponential backoff, `removeOnComplete`, `removeOnFail: 1000`. The worker handles three job types — `register`, `password-reset`, `password-reset-success` — each delegating to a Handlebars-templated `nodemailer` call. `src/jobs/scheduler.ts` runs the worker + the payment cron in one process, with SIGINT/SIGTERM shutdown that stops the cron, closes the worker, and quits Redis.

---

## Observability + safety nets

- **Pino** with two transport targets (stdout + `logs/app.log` via `pino-roll`), `base: null`, epoch timestamps. `pino-http` exposes `request.log`.
- **helmet**, **cors** scoped to `FRONTEND_URL`.
- **AppError** everywhere: `(statusCode, message, details?)`. The error handler maps `ZodError → 422`, `AppError → statusCode`, otherwise 500 + logged.
- **Env parsing** is Zod + `dotenv/config` at process start — malformed env aborts boot with a readable validation error.
- **Prisma guard**: `scripts/prisma-guard.mjs` wraps every `prisma` invocation and refuses destructive commands (`migrate dev/reset`, `db push/execute`) and dangerous flags (`--force*`, `--accept-data-loss`) outside `NODE_ENV=development`. A matching `src/bootstrap/prohibitDestructive.ts` enforces the same at runtime.
- **CLI** (yargs, `src/cli.ts`): `seed-users` (20 users, shared password, rerun-safe), `seed-products` (200 across 12 categories), `send-emails`, `clean-logs`.

---

## What's data-shaped

The database already encodes the invariants:

- `Payment.reference @unique` — one local payment per reference.
- `PaymentWebhookEvent (provider, eventId)` unique — webhook replay guard.
- `LedgerEntry (type, reference)` unique — double-booking guard for both payments and refunds.
- `IdempotencyKey (userId, key)` unique, indexed `[expiresAt]` for scan/GC.
- `OAuthAccount (provider, providerAccountId)` unique.
- `Image (imageableType, imageableId, userId)` unique.
- `CartItem (cartId, productId)` unique.
- `OrderItem (orderId, productId)` unique.
- `Review (userId, productId)` unique + two composite indexes tuned for product-page reads (`approved + createdAt`, `approved + rating`).

Money is integer minor units everywhere; Flutterwave is the only gateway that adapts to/from major units and it does so at its own boundary — the rest of the system never sees a float.

---

## What's stubbed or inconsistent

Honest inventory so you don't trip over it:

- `controllers/notification.controller.ts`, `follow.controller.ts`, `services/mailer.service.ts`, `controllers/task.controllers.ts` are empty handlers.
- `routes/api.ts`: `cartRouter.delete("/clear")` is declared **after** `cartRouter.delete("/:id")` — `/clear` matches `:id`.
- `routes/api.ts`: category routes use `:name`, handlers parse `{id}`.
- `routes/api.ts`: `orderRouter.delete("/")` has no `:id` param.
- `controllers/review.controller.ts` exists but no review routes are registered.
- `jobs/emailQueue.ts:addEmailJob` chains `.then` twice — logs twice.
- `jobs/emailWorker.ts` registers `completed` twice.
- `configs/multer.ts` reads `process.env.UPLOAD_DIR` directly; `env.ts` doesn't declare it.
- Static mount for `/storage` (how uploaded images are served) is referenced in URLs but not wired in `app.ts`.
- Payment webhook `EventEmitter` is defined and typed but never emitted.
