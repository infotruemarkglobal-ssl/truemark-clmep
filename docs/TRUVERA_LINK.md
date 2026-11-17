# The link to Truvera

Truvera is the certification body's management system (impartiality, schemes, examiners, complaints, management review). CLMEP stays the system of record for every person certified: Truvera only **reads**.

## Turn it on

1. Generate a secret: `openssl rand -base64 36`.
2. Set it as `TRUVERA_INTEGRATION_KEY` in CLMEP's environment, and give the same value to Truvera.
3. Deploy. Until the variable is set (32 characters or more) the endpoint answers 503.

## What Truvera can read

`GET /api/v1/body/certificates?cursor=<id>&limit=<1..200>` with `Authorization: Bearer <key>`.

Each certificate: its own `id` (stable across renewals; a renewal changes the number on the same record), `certificateNumber`, `status` (ACTIVE, REVOKED, SUSPENDED), `validNow`, scheme code and name as they were at issue, `standardVersion`, `issuedAt`, `expiresAt`, `revokedAt`, and the holder's **name and country** only.

Never sent: email addresses, dates of birth, ID details, revocation reasons, exam data. Read-only, rate limited, never cached.

## Turn it off

Remove the variable and redeploy.
