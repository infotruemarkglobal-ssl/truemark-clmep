# Stripe — Not Integrated

The `stripe` package (`^22.0.1`) is listed in `package.json` but is **not connected to any API routes**.

**Active payment provider: Paystack**

All payment flows — initiation, webhook, and verification — are handled by:
- `src/app/api/payments/paystack/initiate/route.ts`
- `src/app/api/payments/paystack/webhook/route.ts`
- `src/app/api/payments/paystack/verify/route.ts`

The `Purchase` model includes a `stripePaymentId` column to support a future Stripe integration
without a schema migration. That column is currently unused in all business logic.

## If you integrate Stripe later

1. Create `src/lib/stripe.ts` (mirror `src/lib/paystack.ts`)
2. Add `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` to `.env` / `.env.example`
3. Implement `POST /api/payments/stripe/initiate` and `POST /api/payments/stripe/webhook`
4. Wire the webhook endpoint in the Stripe dashboard (use Stripe CLI for local testing)
5. Populate `stripePaymentId` on the Purchase record after a successful charge
