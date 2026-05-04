const PAYSTACK_BASE = "https://api.paystack.co";
const SECRET = process.env.PAYSTACK_SECRET_KEY!;

function headers() {
  return {
    Authorization: `Bearer ${SECRET}`,
    "Content-Type": "application/json",
  };
}

export async function paystackInitialize(params: {
  email: string;
  amount: number; // in kobo/pesewas (amount * 100)
  currency: string;
  reference: string;
  metadata?: Record<string, unknown>;
  callback_url: string;
}): Promise<{
  status: boolean;
  message: string;
  data: { authorization_url: string; access_code: string; reference: string };
}> {
  if (!SECRET) {
    return { status: false, message: "PAYSTACK_SECRET_KEY not configured", data: { authorization_url: "", access_code: "", reference: "" } };
  }
  const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(params),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { status: false, message: `Paystack returned unexpected response (HTTP ${res.status})`, data: { authorization_url: "", access_code: "", reference: "" } };
  }
}

export async function paystackVerify(reference: string): Promise<{
  status: boolean;
  message: string;
  data: {
    status: string;
    reference: string;
    amount: number;
    currency: string;
    paid_at: string;
    customer: { email: string };
    metadata: Record<string, unknown>;
  };
}> {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/verify/${reference}`, {
    headers: headers(),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { status: false, message: `Paystack returned unexpected response (HTTP ${res.status})`, data: { status: "failed", reference, amount: 0, currency: "", paid_at: "", customer: { email: "" }, metadata: {} } };
  }
}

/** Convert amount to smallest currency unit (Paystack uses kobo for NGN, pesewas for GHS) */
export function toSmallestUnit(amount: number, currency: string): number {
  // All Paystack supported currencies use 2 decimal places
  return Math.round(amount * 100);
}
