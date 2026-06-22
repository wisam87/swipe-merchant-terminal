import type { NextRequest } from "next/server";
import { getPayment } from "@/app/lib/swipe";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ paymentId: string }> },
) {
  const { paymentId } = await ctx.params;
  try {
    const payment = await getPayment(paymentId);
    return Response.json(payment);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 502 });
  }
}
