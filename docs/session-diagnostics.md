# Investigating WhatsApp session incidents

This guide applies to the customized OpenWA 0.30.2 integration. It is for diagnosing reliability and account restrictions, **not** for circumventing WhatsApp enforcement.

## Preserve evidence first

1. Record the incident's exact local date, time and time zone, and the session ID.
2. Capture the WhatsApp notice and the session status in the dashboard, if available.
3. **Do not log out or delete a session just to clear an error.** Those operations unlink credentials and make subsequent investigation harder. Capture the relevant evidence before an operator intentionally removes one.
4. Open **Audit Logs** and filter by the incident's time window, session ID and text, such as `session_restricted`, `session_disconnected` or `message_failed`. The text filter searches the entire retained database, not only the visible page.
5. Export the filtered CSV and store it securely. The existing export has a safety cap: heed any truncation or throttling warning rather than treating a partial CSV as complete.
6. If server logs are required, examine the time window in the container's structured logs. Redact tokens, numbers, message contents, cookies and personal identifiers before sharing.

## What the events mean

| Action | Meaning | Does it prove a Meta restriction? |
| --- | --- | --- |
| `session_restricted` | The engine reported an account restriction. Check the attached kind/code and timestamp. | Evidence of a reported restriction, not its cause |
| `session_restriction_lifted` | A previously reported restriction was cleared or disproved by a successful connection. | No |
| `session_disconnected` | A terminal device unlink was recorded. Not every transient connection loss creates this audit event. | No |
| `session_logged_out` | The API's explicit logout operation completed successfully. | No |
| `session_deleted` | The API's session deletion operation completed successfully. | No |
| `session_qr_generated` | The API supplied a QR code to a caller. Multiple reads may be logged. | No |
| `message_failed` | An outgoing message failed; inspect the error and session state. | No |

Audit records survive deleting a session because they live in the main audit database, but they are subject to retention. By default, `AUDIT_RETENTION_DAYS` is 90. Changing this setting must be accompanied by a data-minimization and retention decision.

**No event is not proof of no restriction:** WhatsApp may not expose every enforcement signal to an unofficial connection engine. Conversely, a disconnect or a successful set of messages does not establish why a later restriction occurred.

## Query details

The `GET /api/audit` endpoint remains ADMIN-only and respects API-key session scopes. Its additional filters are:

- `search`: case-insensitive substring within action, error message, session name or session ID, maximum 120 characters
- `sessionId`: exact session ID, including IDs of deleted sessions that still have retained audit entries
- `from`: inclusive UTC timestamp, for example `2026-11-13T00:00:00.000Z`
- `to`: exclusive UTC timestamp, for example `2026-11-14T00:00:00.000Z`

The dashboard's date inputs translate local calendar days into those UTC boundaries, with the end date included for the operator. All filters apply **before** pagination. Existing paging and per-page limits remain in place.

## Recommended incident report

Record the session ID, account type (WhatsApp or WhatsApp Business), exact incident time and time zone, last successful action, status shown by WhatsApp, status shown by OpenWA, relevant filtered audit events, and whether logout/delete was requested afterward.

Do not publish raw session credentials or the contents of customers' messages. A telephone number being valid is not proof that the recipient consented to a campaign. Follow WhatsApp policy and applicable data-protection rules. Avoid repeated bulk sends while restrictions are ongoing.
