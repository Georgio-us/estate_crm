# Integration foundation

## What exists now

The CRM has one canonical inbound-lead pipeline. Provider adapters normalize their payload into a provider/event ID, contact name and phone, and optional request text.

Processing is organization-scoped and transactional. It records the integration event, resolves a contact by normalized phone, reuses the newest active deal when one exists, otherwise creates a deal in the default first stage, appends deal history, and queues a Telegram notification. The notification outbox is durable, but no Telegram delivery worker is enabled yet.

`organization + provider + external event ID` is unique. Provider retries therefore do not create duplicate contacts, deals, history, or notifications, including concurrent retries.

## Safe test without external accounts

Open **Интеграции → Тестовый шлюз**, choose a simulated source, and submit a name, phone, and request. The authenticated admin-only endpoint is `POST /integrations/test-lead`.

Use a new phone to verify contact/deal creation. Submit another request with the same phone to verify that the active deal is reused and the inquiry appears in its history. Supplying the same `externalId` to the API twice verifies transport idempotency.

## Deliberately not enabled

- No Telegram bot was created and no messages are delivered.
- No Meta Developer application, webhook subscription, Instagram permission, or telephony account was created.
- No provider secret is stored in the database or Railway.
- Provider cards remain `CREDENTIALS_REQUIRED`; a simulated event does not mark an external service connected.

## Next vertical slice: Meta Lead Ads to Telegram

When access is available, add a Meta webhook adapter that validates the provider signature and maps a lead to the canonical input. Then add an outbox worker and a Telegram transport using either the existing client bot or a new shared bot. Only at that point are Meta tokens, webhook verification data, and Telegram credentials required in the deployment secret store.
