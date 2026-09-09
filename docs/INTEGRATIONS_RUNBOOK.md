# Integration foundation

## What exists now

The CRM has one canonical inbound-lead pipeline. Provider adapters normalize their payload into a provider/event ID, contact name and phone, and optional request text.

Processing is organization-scoped and transactional. It records the integration event, resolves a contact by normalized phone, reuses the newest active deal when one exists, otherwise creates a deal in the default first stage, appends deal history, and queues a Telegram notification. The durable Telegram delivery worker sends each queued notification independently and retries temporary failures with exponential backoff.

`organization + provider + external event ID` is unique. Provider retries therefore do not create duplicate contacts, deals, history, or notifications, including concurrent retries.

## Safe test without external accounts

Open **Интеграции → Тестовый шлюз**, choose a simulated source, and submit a name, phone, and request. The authenticated admin-only endpoint is `POST /integrations/test-lead`.

Use a new phone to verify contact/deal creation. Submit another request with the same phone to verify that the active deal is reused and the inquiry appears in its history. Supplying the same `externalId` to the API twice verifies transport idempotency.

## Delmar Meta Lead Ads through Google Sheets

The first real provider adapter uses the client's existing transport instead of waiting for a Meta Developer application:

`Meta Lead Form → Google Sheets → Apps Script → Estate CRM`

An admin creates the connection in **Интеграции → Meta Lead Ads · Google Sheets**. The setup endpoint returns a webhook URL and a 256-bit secret once; only its SHA-256 hash is stored in PostgreSQL. The public webhook requires that secret in `x-estate-crm-secret`, resolves the organization from the connection, and submits the row to the same canonical inbound-lead pipeline.

The Apps Script source of truth is [`docs/google-apps-script/Code.gs`](google-apps-script/Code.gs). Keep the existing Telegram endpoint and marker. Add the CRM webhook URL and secret as Apps Script properties named `ESTATE_CRM_WEBHOOK_URL` and `ESTATE_CRM_WEBHOOK_SECRET`. On its first configured run, `sendNewMetaLeads` automatically stores the next sheet row in `ESTATE_CRM_START_ROW`; historical rows are therefore not imported. `initializeEstateCrmIntegration` remains available only as an explicit cutover reset. The existing minute trigger continues to call `sendNewMetaLeads`; successful CRM deliveries are marked separately in `estate_crm_sent_at`.

If Apps Script retries after a timeout, the Meta Lead ID remains the external event ID, so the CRM returns the existing result instead of creating another contact, deal, activity, or notification.

## Estate CRM Telegram notifications

The shared bot is configured only on `estate_crm_api` through sealed Railway variables `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME`. Railway's `RAILWAY_PUBLIC_DOMAIN` is used to register `POST /webhooks/telegram` automatically; `API_PUBLIC_URL` is an optional explicit override.

A signed-in CRM user opens **Интеграции → Telegram → Подключить Telegram**. The API creates a random one-time token valid for ten minutes, stores only its SHA-256 hash, and opens the bot through a Telegram deep link. `/start` consumes that token once and binds the Telegram chat to the CRM user and organization. No chat IDs or owner lists are stored in environment variables.

CRM roles control delivery scope. Admins and team leads receive organization-wide lead notifications. Managers receive only notifications for deals assigned to them. The message intentionally contains no lead form fields or telephone number: only `Новый лид · #<номер сделки>` / `Повторное обращение · #<номер сделки>` and an **Открыть лид** button that targets `/?deal=<deal-id>` in the CRM. Older queued notifications created before deal numbers were added remain deliverable with the previous short title.

`notification_outbox` remains the source of truth. Per-recipient results live in `notification_deliveries`, so a retry for one failed recipient does not duplicate a message already delivered to another. After five failed attempts the delivery and its outbox item are marked failed instead of retrying forever. If no eligible Telegram recipient is connected, the item remains pending and is delivered after an eligible user connects.

## Deliberately not enabled

- No direct Meta Developer application, Meta webhook subscription, Instagram permission, or telephony account was created.
- No plaintext provider secret is stored in the database or Railway; only the webhook secret hash is persisted by the CRM.
- The Meta Lead Ads connection is `CONNECTED` for Delmar through Google Sheets. Other provider cards remain `CREDENTIALS_REQUIRED`; a simulated event does not connect an external service.
- The client's pre-existing Apps Script → Telegram route remains independent. Keeping it enabled together with the CRM bot intentionally produces two separate notifications until the old route is switched off.

## Later: direct Meta delivery

When direct Meta access is available, add a second transport adapter that validates the provider signature and maps a lead to the same canonical input. Meta tokens and webhook verification data will then be required in the deployment secret store; Telegram delivery does not depend on that future adapter.

Sending qualification outcomes back to Meta is a separate outbound integration, not part of lead ingestion. It requires semantic CRM outcomes, a dedicated Meta event outbox, customer-specific Meta authorization, idempotent delivery, retries, and an operational delivery log. It is intentionally deferred because the current client workflow does not require it for basic CRM operation.

See [`META_LEAD_INTEGRATION.md`](META_LEAD_INTEGRATION.md) for the complete Russian-language architecture and product boundary.
