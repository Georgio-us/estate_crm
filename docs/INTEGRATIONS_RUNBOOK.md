# Integration foundation

## What exists now

The CRM has one canonical inbound-lead pipeline. Provider adapters normalize their payload into a provider/event ID, contact name and phone, and optional request text.

Processing is organization-scoped and transactional. It records the integration event, resolves a contact by normalized phone, reuses the newest active deal when one exists, otherwise creates a deal in the default first stage, appends deal history, and queues a Telegram notification. The notification outbox is durable, but no Telegram delivery worker is enabled yet.

`organization + provider + external event ID` is unique. Provider retries therefore do not create duplicate contacts, deals, history, or notifications, including concurrent retries.

## Safe test without external accounts

Open **Интеграции → Тестовый шлюз**, choose a simulated source, and submit a name, phone, and request. The authenticated admin-only endpoint is `POST /integrations/test-lead`.

Use a new phone to verify contact/deal creation. Submit another request with the same phone to verify that the active deal is reused and the inquiry appears in its history. Supplying the same `externalId` to the API twice verifies transport idempotency.

## Delmar Meta Lead Ads through Google Sheets

The first real provider adapter uses the client's existing transport instead of waiting for a Meta Developer application:

`Meta Lead Form → Google Sheets → Apps Script → Estate CRM`

An admin creates the connection in **Интеграции → Meta Lead Ads · Google Sheets**. The setup endpoint returns a webhook URL and a 256-bit secret once; only its SHA-256 hash is stored in PostgreSQL. The public webhook requires that secret in `x-estate-crm-secret`, resolves the organization from the connection, and submits the row to the same canonical inbound-lead pipeline.

The Apps Script source of truth is [`docs/google-apps-script/Code.gs`](google-apps-script/Code.gs). Keep the existing Telegram endpoint and marker. Add the CRM webhook URL and secret as Apps Script properties named `ESTATE_CRM_WEBHOOK_URL` and `ESTATE_CRM_WEBHOOK_SECRET`, then run `initializeEstateCrmIntegration` once. It records the next sheet row as the cutover, so historical rows are not imported. The existing minute trigger continues to call `sendNewMetaLeads`; successful CRM deliveries are marked separately in `estate_crm_sent_at`.

If Apps Script retries after a timeout, the Meta Lead ID remains the external event ID, so the CRM returns the existing result instead of creating another contact, deal, activity, or notification.

## Deliberately not enabled

- No Telegram bot was created and no messages are delivered.
- No direct Meta Developer application, Meta webhook subscription, Instagram permission, or telephony account was created.
- No provider secret is stored in the database or Railway.
- Provider cards remain `CREDENTIALS_REQUIRED`; a simulated event does not mark an external service connected.

## Later: direct Meta and Telegram delivery

When direct Meta access is available, add a second transport adapter that validates the provider signature and maps a lead to the same canonical input. Then add an outbox worker and a Telegram transport using either the existing client bot or a new shared bot. Only at that point are Meta tokens, webhook verification data, and Telegram credentials required in the deployment secret store.
