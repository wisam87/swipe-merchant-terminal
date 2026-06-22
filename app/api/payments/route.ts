import { NextRequest } from "next/server";
import { createPayment } from "@/app/lib/swipe";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { amount, currency, description } = (body ?? {}) as {
    amount?: unknown;
    currency?: unknown;
    description?: unknown;
  };

  const amt = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return Response.json({ error: "Amount must be > 0" }, { status: 400 });
  }

  const cur = currency === "USD" ? "USD" : "MVR";
  const desc = typeof description === "string" ? description : undefined;

  try {
    const payment = await createPayment({ amount: amt, currency: cur, description: desc });
    return Response.json(payment, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 502 });
  }
}
