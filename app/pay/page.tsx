"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

type Currency = "MVR" | "USD";

// The REST endpoints use COMPLETED/EXPIRED/CANCELLED; the SSE stream uses its
// own vocabulary (e.g. CONFIRMED) and sends it as a bare string. Allow any
// string and classify by category rather than exact match.
type PaymentStatus = "PENDING" | "COMPLETED" | "CONFIRMED" | "EXPIRED" | "CANCELLED" | (string & {});

const SUCCESS_STATUSES = new Set([
  "COMPLETED",
  "CONFIRMED",
  "FULFILLED",
  "SUCCESS",
  "SUCCESSFUL",
  "PAID",
  "SETTLED",
]);
const FAILED_STATUSES = new Set([
  "EXPIRED",
  "CANCELLED",
  "CANCELED",
  "FAILED",
  "DECLINED",
  "REJECTED",
  "VOID",
  "REVERSED",
]);

function classifyStatus(s?: string): "success" | "failed" | "pending" {
  if (!s) return "pending";
  const u = s.trim().toUpperCase();
  if (SUCCESS_STATUSES.has(u)) return "success";
  if (FAILED_STATUSES.has(u)) return "failed";
  return "pending";
}

type Payment = {
  id: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  reference?: string;
  short_code?: string;
  qr_data?: string;
  qr_svg?: string;
  qr_emv?: string;
  payment_url?: string;
  created_at?: string;
};

type Step = "amount" | "qr" | "success";

function formatAmount(raw: string): string {
  if (raw === "" || raw === "0") return "0";
  const [whole, frac] = raw.split(".");
  const w = whole.replace(/^0+(?=\d)/, "") || "0";
  const withCommas = w.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac === undefined ? withCommas : `${withCommas}.${frac.slice(0, 2)}`;
}

function parseAmount(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function decodeBase64(s: string): string {
  if (typeof window === "undefined") return s;
  try {
    return atob(s);
  } catch {
    return s;
  }
}

export default function PayPage() {
  const [step, setStep] = useState<Step>("amount");
  const [direction, setDirection] = useState<1 | -1>(1);
  const [currency, setCurrency] = useState<Currency>("MVR");
  const [raw, setRaw] = useState<string>("");
  const [payment, setPayment] = useState<Payment | null>(null);
  const [qrSrc, setQrSrc] = useState<string>("");
  const [qrSvg, setQrSvg] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [checking, setChecking] = useState<boolean>(false);
  const [statusNote, setStatusNote] = useState<string>("");

  const amount = parseAmount(raw);
  const canContinue = amount > 0 && !submitting;

  const goTo = useCallback((next: Step, dir: 1 | -1 = 1) => {
    setDirection(dir);
    setStep(next);
  }, []);

  const reset = useCallback(() => {
    setRaw("");
    setPayment(null);
    setQrSrc("");
    setQrSvg("");
    setError("");
    setStatusNote("");
    setChecking(false);
    goTo("amount", -1);
  }, [goTo]);

  // Resolve a fetched payment into a UI transition. Returns true if it reached
  // a terminal state. Shared by the SSE handler, polling, and manual recheck.
  const applyStatus = useCallback(
    (p: Partial<Payment> & { status?: PaymentStatus }): boolean => {
      const status = p.status;
      if (!status) return false;
      // Only update status + reference from a status check — never the QR
      // fields (qr_data/qr_svg/short_code), or the QR would re-render/flicker
      // on every poll. The QR is fixed once the payment is created.
      setPayment((cur) =>
        cur ? { ...cur, status, reference: p.reference ?? cur.reference } : cur,
      );
      const kind = classifyStatus(status);
      if (kind === "success") {
        setStatusNote("");
        goTo("success", 1);
        return true;
      }
      if (kind === "failed") {
        setError(`Payment ${status.toLowerCase()}`);
        goTo("amount", -1);
        return true;
      }
      return false;
    },
    [goTo],
  );

  // Manual status check — hits the same watch endpoint the poll uses (webhook
  // store, with a direct-read fallback). Works on Vercel where direct Swipe
  // reads are Cloudflare-blocked.
  const recheck = useCallback(async () => {
    if (!payment?.id || checking) return;
    setChecking(true);
    setStatusNote("");
    try {
      const since = payment.created_at ? Date.parse(payment.created_at) : 0;
      const res = await fetch(
        `/api/payments/watch?id=${encodeURIComponent(payment.id)}` +
          `&amount=${encodeURIComponent(String(payment.amount))}` +
          `&currency=${encodeURIComponent(payment.currency ?? "")}` +
          `&since=${since || 0}`,
        { cache: "no-store" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Status check failed (${res.status})`);
      const terminal = applyStatus({
        status: data.status as PaymentStatus,
        reference: data.reference,
      });
      if (!terminal) setStatusNote("Not paid yet — still waiting for the customer.");
    } catch (e) {
      setStatusNote(e instanceof Error ? e.message : "Status check failed");
    } finally {
      setChecking(false);
    }
  }, [payment?.id, payment?.amount, payment?.currency, payment?.created_at, checking, applyStatus]);

  const appendDigit = useCallback((d: string) => {
    setRaw((cur) => {
      if (d === ".") {
        if (cur.includes(".")) return cur;
        return cur === "" ? "0." : cur + ".";
      }
      if (cur === "0") return d;
      const next = cur + d;
      const [, frac] = next.split(".");
      if (frac && frac.length > 2) return cur;
      if (next.replace(".", "").length > 12) return cur;
      return next;
    });
  }, []);

  const backspace = useCallback(() => {
    setRaw((cur) => cur.slice(0, -1));
  }, []);

  const submitAmount = useCallback(async () => {
    if (!canContinue) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, currency }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? `Request failed (${res.status})`);
      }
      const p = (await res.json()) as Payment;
      setPayment(p);
      goTo("qr", 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create payment");
    } finally {
      setSubmitting(false);
    }
  }, [amount, canContinue, currency, goTo]);

  // Keyboard support — active across all steps for the relevant keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (step === "amount") {
        if (e.key >= "0" && e.key <= "9") {
          appendDigit(e.key);
          e.preventDefault();
        } else if (e.key === ".") {
          appendDigit(".");
          e.preventDefault();
        } else if (e.key === "Backspace") {
          backspace();
          e.preventDefault();
        } else if (e.key === "Enter") {
          submitAmount();
          e.preventDefault();
        } else if (e.key === "Escape") {
          setRaw("");
          e.preventDefault();
        }
      } else if (step === "qr") {
        if (e.key === "Escape") {
          reset();
          e.preventDefault();
        }
      } else if (step === "success") {
        if (e.key === "Enter" || e.key === " ") {
          reset();
          e.preventDefault();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, appendDigit, backspace, submitAmount, reset]);

  // Render the QR once the payment is created. Swipe returns a pre-rendered,
  // branded SVG (decoded server-side into qr_svg); fall back to generating a
  // plain QR from the raw EMV payload if that's all we got.
  useEffect(() => {
    if (step !== "qr" || !payment) return;
    if (payment.qr_svg) {
      setQrSvg(payment.qr_svg);
      setQrSrc("");
      return;
    }
    const emv = payment.qr_emv ?? (payment.qr_data ? decodeBase64(payment.qr_data) : "");
    if (!emv) return;
    QRCode.toDataURL(emv, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 560,
      color: { dark: "#0a0a0a", light: "#ffffff" },
    })
      .then(setQrSrc)
      .catch(() => setQrSrc(""));
    // Keyed on the payment id only — the QR is rendered once per payment and
    // must not re-run when status/reference change on a poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, payment?.id]);

  // Watch for payment completion by polling the payment-status endpoint
  // (GET /api/v1/payments/{id} via our proxy). The SSE stream isn't working
  // upstream yet, so it's commented out below and ready to re-enable later.
  useEffect(() => {
    if (step !== "qr" || !payment?.id) return;
    const id = payment.id;
    let cancelled = false;
    let pollId: ReturnType<typeof setInterval> | null = null;

    const finish = (p: Partial<Payment> & { status?: PaymentStatus }) => {
      if (cancelled) return;
      if (applyStatus(p)) cleanup();
    };

    const since = payment.created_at ? Date.parse(payment.created_at) : 0;
    const watchUrl =
      `/api/payments/watch?id=${encodeURIComponent(id)}` +
      `&amount=${encodeURIComponent(String(payment.amount))}` +
      `&currency=${encodeURIComponent(payment.currency ?? "")}` +
      `&since=${since || 0}`;

    const tick = async () => {
      try {
        const res = await fetch(watchUrl, { cache: "no-store" });
        if (!res.ok) return;
        finish((await res.json()) as Payment);
      } catch {
        /* swallow polling errors */
      }
    };

    function cleanup() {
      if (pollId) {
        clearInterval(pollId);
        pollId = null;
      }
    }

    // Poll immediately, then every 2.5s while the QR is shown.
    tick();
    pollId = setInterval(tick, 2500);

    // --- SSE stream (disabled until the upstream stream is fixed) -------------
    // Re-enable this block to switch from polling to live Server-Sent Events.
    // The proxy normalizes each frame to `{ status, reference }`.
    //
    // const handle = (raw: string) => {
    //   let data: unknown;
    //   try { data = JSON.parse(raw); } catch { return; }
    //   const d = data as { status?: PaymentStatus; reference?: string };
    //   finish({ status: d.status, reference: d.reference });
    // };
    // const es = new EventSource(`/api/payments/${id}/stream`);
    // es.onmessage = (ev) => handle(ev.data);
    // es.onerror = () => { if (es.readyState === EventSource.CLOSED) es.close(); };
    // (remember to es.close() in cleanup())
    // -------------------------------------------------------------------------

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [step, payment?.id, applyStatus]);

  return (
    <div className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <BackgroundMesh />

      <div className="relative z-10 w-full max-w-2xl px-6 py-10">
        <header className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LogoMark />
            <div>
              <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Swipe</p>
              <p className="text-base font-semibold tracking-tight">Merchant Terminal</p>
            </div>
          </div>
          <Stepper step={step} />
        </header>

        <main className="relative">
          <div
            key={step}
            className="will-change-transform"
            style={{
              animation: `${direction === 1 ? "slideInRight" : "slideInLeft"} 380ms cubic-bezier(.22,1,.36,1) both`,
            }}
          >
            {step === "amount" && (
              <AmountStep
                raw={raw}
                currency={currency}
                onCurrency={setCurrency}
                onDigit={appendDigit}
                onBackspace={backspace}
                onClear={() => setRaw("")}
                onContinue={submitAmount}
                submitting={submitting}
                canContinue={canContinue}
                error={error}
              />
            )}
            {step === "qr" && payment && (
              <QrStep
                payment={payment}
                qrSrc={qrSrc}
                qrSvg={qrSvg}
                onCancel={reset}
                onRecheck={recheck}
                checking={checking}
                note={statusNote}
              />
            )}
            {step === "success" && payment && (
              <SuccessStep payment={payment} onDone={reset} />
            )}
          </div>
        </main>

        <footer className="mt-10 text-center text-xs text-zinc-500 dark:text-zinc-500">
          Tablet & keyboard friendly · Press Esc to {step === "amount" ? "clear" : "cancel"}
        </footer>
      </div>
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const items: { key: Step; label: string }[] = [
    { key: "amount", label: "Amount" },
    { key: "qr", label: "Scan" },
    { key: "success", label: "Done" },
  ];
  const activeIdx = items.findIndex((i) => i.key === step);
  return (
    <ol className="flex items-center gap-2">
      {items.map((it, i) => {
        const active = i === activeIdx;
        const done = i < activeIdx;
        return (
          <li key={it.key} className="flex items-center gap-2">
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-all duration-300 ${
                active
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/40"
                  : done
                    ? "bg-emerald-500 text-white"
                    : "bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500"
              }`}
            >
              {done ? "✓" : i + 1}
            </span>
            <span
              className={`hidden text-xs font-medium sm:inline ${
                active ? "text-zinc-900 dark:text-zinc-50" : "text-zinc-500"
              }`}
            >
              {it.label}
            </span>
            {i < items.length - 1 && (
              <span className="mx-1 hidden h-px w-6 bg-zinc-300 sm:inline-block dark:bg-zinc-700" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function AmountStep(props: {
  raw: string;
  currency: Currency;
  onCurrency: (c: Currency) => void;
  onDigit: (d: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onContinue: () => void;
  submitting: boolean;
  canContinue: boolean;
  error: string;
}) {
  const display = formatAmount(props.raw);
  const isZero = display === "0";

  return (
    <div className="rounded-3xl border border-zinc-200/80 bg-white/80 p-6 shadow-xl shadow-zinc-900/5 backdrop-blur-xl sm:p-8 dark:border-zinc-800/60 dark:bg-zinc-900/60 dark:shadow-black/40">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-sm font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Enter amount
        </h1>
        <div className="inline-flex rounded-full bg-zinc-100 p-1 dark:bg-zinc-800">
          {(["MVR", "USD"] as Currency[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => props.onCurrency(c)}
              className={`relative rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                props.currency === c
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50"
                  : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-8 flex items-end justify-center gap-2 py-4">
        <span className="mb-3 text-2xl font-medium text-zinc-400 dark:text-zinc-500">
          {props.currency}
        </span>
        <span
          className={`tabular-nums text-7xl font-semibold tracking-tight transition-colors sm:text-8xl ${
            isZero ? "text-zinc-300 dark:text-zinc-700" : "text-zinc-900 dark:text-zinc-50"
          }`}
          aria-live="polite"
        >
          {display}
        </span>
      </div>

      <Keypad onDigit={props.onDigit} onBackspace={props.onBackspace} />

      {props.error && (
        <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-center text-sm font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
          {props.error}
        </p>
      )}

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={props.onClear}
          className="h-14 flex-1 rounded-2xl border border-zinc-200 bg-white text-base font-semibold text-zinc-700 transition-all hover:bg-zinc-50 active:scale-[.98] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={props.onContinue}
          disabled={!props.canContinue}
          className="group relative h-14 flex-[2] overflow-hidden rounded-2xl bg-zinc-900 text-base font-semibold text-white shadow-lg shadow-zinc-900/20 transition-all hover:shadow-xl hover:shadow-zinc-900/30 active:scale-[.98] disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500 disabled:shadow-none dark:bg-white dark:text-zinc-900 dark:shadow-white/10 disabled:dark:bg-zinc-800 disabled:dark:text-zinc-600"
        >
          <span className="relative z-10 flex items-center justify-center gap-2">
            {props.submitting ? (
              <>
                <Spinner /> Creating…
              </>
            ) : (
              <>
                Continue
                <kbd className="hidden rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-mono text-white/80 sm:inline dark:bg-zinc-900/15 dark:text-zinc-900/70">
                  Enter
                </kbd>
              </>
            )}
          </span>
        </button>
      </div>
    </div>
  );
}

function Keypad({
  onDigit,
  onBackspace,
}: {
  onDigit: (d: string) => void;
  onBackspace: () => void;
}) {
  const keys: { label: string; value: string; ariaLabel?: string }[] = [
    { label: "1", value: "1" },
    { label: "2", value: "2" },
    { label: "3", value: "3" },
    { label: "4", value: "4" },
    { label: "5", value: "5" },
    { label: "6", value: "6" },
    { label: "7", value: "7" },
    { label: "8", value: "8" },
    { label: "9", value: "9" },
    { label: ".", value: "." },
    { label: "0", value: "0" },
  ];
  return (
    <div className="grid grid-cols-3 gap-3">
      {keys.map((k) => (
        <KeyButton key={k.value} onPress={() => onDigit(k.value)}>
          {k.label}
        </KeyButton>
      ))}
      <KeyButton onPress={onBackspace} ariaLabel="Backspace">
        <BackspaceIcon />
      </KeyButton>
    </div>
  );
}

function KeyButton({
  children,
  onPress,
  ariaLabel,
}: {
  children: React.ReactNode;
  onPress: () => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={ariaLabel}
      className="group relative flex h-20 items-center justify-center rounded-2xl bg-white text-2xl font-semibold text-zinc-800 ring-1 ring-zinc-200 transition-all duration-150 hover:ring-zinc-300 active:scale-[.96] active:bg-zinc-100 active:ring-zinc-400 sm:h-24 sm:text-3xl dark:bg-zinc-800/60 dark:text-zinc-100 dark:ring-zinc-700/60 dark:hover:ring-zinc-600 dark:active:bg-zinc-700"
    >
      <span className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-white/40 to-transparent opacity-0 transition-opacity group-active:opacity-100 dark:from-white/5" />
      {children}
    </button>
  );
}

function QrStep({
  payment,
  qrSrc,
  qrSvg,
  onCancel,
  onRecheck,
  checking,
  note,
}: {
  payment: Payment;
  qrSrc: string;
  qrSvg: string;
  onCancel: () => void;
  onRecheck: () => void;
  checking: boolean;
  note: string;
}) {
  return (
    <div className="rounded-3xl border border-zinc-200/80 bg-white/80 p-6 shadow-xl shadow-zinc-900/5 backdrop-blur-xl sm:p-8 dark:border-zinc-800/60 dark:bg-zinc-900/60 dark:shadow-black/40">
      <div className="mb-6 text-center">
        <p className="text-sm font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Scan to pay
        </p>
        <p className="mt-2 text-4xl font-semibold tabular-nums tracking-tight">
          <span className="text-zinc-400 dark:text-zinc-500">{payment.currency} </span>
          {formatAmount(String(payment.amount))}
        </p>
      </div>

      <div className="relative mx-auto flex aspect-square w-full max-w-sm items-center justify-center">
        <span className="pointer-events-none absolute inset-0 animate-pulse-ring rounded-3xl bg-indigo-500/10" />
        <span
          className="pointer-events-none absolute inset-0 animate-pulse-ring rounded-3xl bg-indigo-500/10"
          style={{ animationDelay: "1.2s" }}
        />
        <div className="relative flex h-full w-full items-center justify-center rounded-3xl bg-white p-4 shadow-2xl shadow-indigo-500/10 ring-1 ring-zinc-200 dark:ring-zinc-700">
          {qrSvg ? (
            <div
              className="h-full w-full rounded-2xl [&>svg]:h-full [&>svg]:w-full"
              style={{ animation: "fadeIn 400ms ease-out both" }}
              // Swipe-issued, pre-rendered branded QR SVG (no user input).
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          ) : qrSrc ? (
            // Use plain img so the data URL renders without next/image config.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrSrc}
              alt="Payment QR code"
              className="h-full w-full rounded-2xl"
              style={{ animation: "fadeIn 400ms ease-out both" }}
            />
          ) : (
            <div className="flex flex-col items-center gap-3 text-zinc-400">
              <Spinner />
              <span className="text-sm">Preparing QR…</span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-col items-center gap-2">
        <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-500" />
          </span>
          Waiting for customer…
        </div>
        <div className="flex flex-col items-center gap-1">
          {payment.short_code && (
            <p className="font-mono text-xs text-zinc-500">
              Short code · {payment.short_code}
            </p>
          )}
          {payment.reference && (
            <p className="font-mono text-xs text-zinc-500">Ref · {payment.reference}</p>
          )}
          {payment.id && (
            <p className="font-mono text-xs text-zinc-500">ID · {payment.id}</p>
          )}
        </div>
      </div>

      {note && (
        <p className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-center text-sm font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          {note}
        </p>
      )}

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="h-12 flex-1 rounded-2xl border border-zinc-200 bg-white text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 active:scale-[.99] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onRecheck}
          disabled={checking}
          className="inline-flex h-12 flex-[1.4] items-center justify-center gap-2 rounded-2xl bg-zinc-900 text-sm font-semibold text-white shadow-lg shadow-zinc-900/20 transition hover:shadow-xl active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-zinc-900"
        >
          {checking ? (
            <>
              <Spinner /> Checking…
            </>
          ) : (
            "Recheck status"
          )}
        </button>
      </div>
    </div>
  );
}

function SuccessStep({ payment, onDone }: { payment: Payment; onDone: () => void }) {
  const btnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    btnRef.current?.focus();
  }, []);

  return (
    <div className="rounded-3xl border border-zinc-200/80 bg-white/80 p-8 text-center shadow-xl shadow-zinc-900/5 backdrop-blur-xl dark:border-zinc-800/60 dark:bg-zinc-900/60 dark:shadow-black/40">
      <div className="mx-auto mb-6 flex h-28 w-28 items-center justify-center">
        <SuccessCheck />
      </div>
      <h2 className="text-2xl font-semibold tracking-tight">Payment received</h2>
      <p
        className="mt-2 text-5xl font-semibold tabular-nums tracking-tight"
        style={{ animation: "fadeUp 500ms 120ms cubic-bezier(.22,1,.36,1) both" }}
      >
        <span className="text-zinc-400 dark:text-zinc-500">{payment.currency} </span>
        {formatAmount(String(payment.amount))}
      </p>
      {payment.short_code && (
        <p
          className="mt-3 font-mono text-xs text-zinc-500"
          style={{ animation: "fadeUp 500ms 240ms cubic-bezier(.22,1,.36,1) both" }}
        >
          Ref · {payment.short_code}
        </p>
      )}
      <button
        ref={btnRef}
        type="button"
        onClick={onDone}
        className="mt-8 inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-zinc-900 px-8 text-base font-semibold text-white shadow-lg shadow-zinc-900/20 transition hover:shadow-xl active:scale-[.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:bg-white dark:text-zinc-900"
        style={{ animation: "fadeUp 500ms 320ms cubic-bezier(.22,1,.36,1) both" }}
      >
        New payment
        <kbd className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-mono text-white/80 dark:bg-zinc-900/15 dark:text-zinc-900/70">
          Enter
        </kbd>
      </button>
    </div>
  );
}

function BackgroundMesh() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute -top-32 left-1/2 h-[480px] w-[680px] -translate-x-1/2 rounded-full bg-indigo-300/30 blur-3xl dark:bg-indigo-700/20" />
      <div className="absolute -bottom-40 right-[-10%] h-[420px] w-[520px] rounded-full bg-emerald-300/25 blur-3xl dark:bg-emerald-600/15" />
      <div className="absolute -bottom-20 left-[-15%] h-[360px] w-[420px] rounded-full bg-rose-300/25 blur-3xl dark:bg-rose-700/15" />
    </div>
  );
}

function LogoMark() {
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/30">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14" />
        <path d="M13 6l6 6-6 6" />
      </svg>
    </div>
  );
}

function BackspaceIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 5H8.5a2 2 0 0 0-1.6.8L2 12l4.9 6.2a2 2 0 0 0 1.6.8H21a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" />
      <path d="m13 9 5 5M18 9l-5 5" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v3a5 5 0 0 0-5 5H4z" />
    </svg>
  );
}

function SuccessCheck() {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full">
      <circle
        cx="50"
        cy="50"
        r="44"
        fill="none"
        stroke="#10b981"
        strokeWidth="6"
        strokeDasharray="276.46"
        strokeDashoffset="276.46"
        style={{ animation: "drawCircle 600ms ease-out forwards" }}
      />
      <circle cx="50" cy="50" r="38" fill="#10b981" opacity="0" style={{ animation: "fadeIn 300ms 500ms ease-out forwards" }} />
      <path
        d="M30 52 L45 67 L72 38"
        fill="none"
        stroke="white"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="70"
        strokeDashoffset="70"
        style={{ animation: "drawCheck 400ms 700ms cubic-bezier(.65,0,.45,1) forwards" }}
      />
    </svg>
  );
}
