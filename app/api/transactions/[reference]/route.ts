import type { NextRequest } from "next/server";
import { getTransaction, NotFoundError } from "@/app/lib/swipe";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ reference: string }> },
) {
  const { reference } = await ctx.params;
  try {
    const transaction = await getTransaction(reference);
    return Response.json(transaction);
  } catch (err) {
    if (err instanceof NotFoundError) {
      // No transaction yet — the customer hasn't paid. Not an error condition.
      return Response.json({ status: "NOT_FOUND", reference }, { status: 404 });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 502 });
  }
}
