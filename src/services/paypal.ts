import type { Env } from "../env.ts";

/** PayPal REST (Orders v2) via fetch — no SDK. Sandbox or live by PAYPAL_ENV. */
function baseUrl(env: Env): string {
  return env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

async function accessToken(env: Env): Promise<string> {
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) {
    throw new Error("PayPal credentials are not configured");
  }
  const auth = btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`);
  const resp = await fetch(`${baseUrl(env)}/v1/oauth2/token`, {
    method: "POST",
    headers: { authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!resp.ok) throw new Error(`PayPal token ${resp.status}: ${await resp.text()}`);
  const json = (await resp.json()) as { access_token: string };
  return json.access_token;
}

export interface DepositOrder {
  orderId: string;
  approveUrl: string;
}

/** Create a CAPTURE order for the deposit; returns the approve link to send the customer to. */
export async function createDepositOrder(
  env: Env,
  input: { amountCents: number; proposalId: string; returnUrl: string; cancelUrl: string; description: string },
): Promise<DepositOrder> {
  const token = await accessToken(env);
  const resp = await fetch(`${baseUrl(env)}/v2/checkout/orders`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          custom_id: input.proposalId,
          description: input.description.slice(0, 127),
          amount: { currency_code: "USD", value: (input.amountCents / 100).toFixed(2) },
        },
      ],
      application_context: {
        brand_name: "Greenscape Pro",
        user_action: "PAY_NOW",
        shipping_preference: "NO_SHIPPING",
        return_url: input.returnUrl,
        cancel_url: input.cancelUrl,
      },
    }),
  });
  if (!resp.ok) throw new Error(`PayPal create ${resp.status}: ${await resp.text()}`);
  const json = (await resp.json()) as { id: string; links: { rel: string; href: string }[] };
  const approve = json.links?.find((l) => l.rel === "approve")?.href;
  if (!approve) throw new Error("PayPal order has no approve link");
  return { orderId: json.id, approveUrl: approve };
}

/** Capture an approved order. Returns the PayPal status (COMPLETED on success). */
export async function captureOrder(env: Env, orderId: string): Promise<{ status: string }> {
  const token = await accessToken(env);
  const resp = await fetch(`${baseUrl(env)}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  });
  if (!resp.ok) throw new Error(`PayPal capture ${resp.status}: ${await resp.text()}`);
  const json = (await resp.json()) as { status: string };
  return { status: json.status };
}

export function paypalConfigured(env: Env): boolean {
  return Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET);
}
