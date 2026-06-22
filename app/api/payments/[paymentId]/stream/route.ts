import type { NextRequest } from "next/server";
import { openPaymentStream, extractStatus } from "@/app/lib/swipe";

// SSE must stream — never statically optimize or buffer this route.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Re-frame the upstream event-stream into a single, predictable shape the
// browser can rely on: `data: {"status","reference"}`. The upstream format is
// unspecified (it may use named events like `transaction.state_changed`, which
// a plain EventSource.onmessage would ignore, and the payload may be nested
// under `data`). Parsing it here makes the client robust to all of that.
function normalizeSse(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  const emit = (
    controller: TransformStreamDefaultController<Uint8Array>,
    block: string,
  ) => {
    const dataLines: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
    }
    if (dataLines.length === 0) return;
    try {
      const parsed = JSON.parse(dataLines.join("\n"));
      const { status, reference } = extractStatus(parsed);
      if (status) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ status, reference })}\n\n`),
        );
      }
    } catch {
      /* keep-alive / comment / non-JSON frame — ignore */
    }
  };

  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer = (buffer + decoder.decode(chunk, { stream: true })).replace(/\r\n/g, "\n");
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        emit(controller, block);
      }
    },
    flush(controller) {
      if (buffer.trim()) emit(controller, buffer);
    },
  });

  return body.pipeThrough(transform);
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ paymentId: string }> },
) {
  const { paymentId } = await ctx.params;

  let upstream: Response;
  try {
    upstream = await openPaymentStream(paymentId, req.signal);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    const blocked = /Attention Required|Cloudflare/i.test(text);
    return Response.json(
      {
        error: blocked
          ? `Stream blocked by Cloudflare (HTTP ${upstream.status})`
          : `Stream failed (${upstream.status})`,
      },
      { status: upstream.status || 502 },
    );
  }

  return new Response(normalizeSse(upstream.body), {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
