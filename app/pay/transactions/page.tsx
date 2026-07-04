"use client";

import { useCallback, useEffect, useState } from "react";
import { classifyStatus } from "@/app/lib/status";

type Transaction = {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  type?: string;
  status: string;
  description?: string;
  gross_amount?: number;
  net_amount?: number;
  fee_amount?: number;
  original_amount?: number;
  created_at?: string;
};

type History = { transactions: Transaction[]; total: number };

const PAGE_SIZE = 15;

function formatMoney(n: number | undefined, currency: string): string {
  const v = typeof n === "number" ? n : 0;
  return `${currency} ${v.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TransactionsPage() {
  const [page, setPage] = useState(0);
  const [data, setData] = useState<History | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (p: number) => {
    setLoading(true);
    setError("");
    try {
      const offset = p * PAGE_SIZE;
      const res = await fetch(`/api/transactions?limit=${PAGE_SIZE}&offset=${offset}`, {
        cache: "no-store",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? `Failed to load (${res.status})`);
      setData(body as History);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load transactions");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(page);
  }, [page, load]);

  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const items = data?.transactions ?? [];
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = page * PAGE_SIZE + items.length;

  return (
    <div className="relative isolate min-h-dvh overflow-hidden bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <BackgroundMesh />

      <div className="relative z-10 mx-auto w-full max-w-3xl px-6 pb-12 pt-20">
        <header className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {total > 0 ? `${total.toLocaleString()} total` : "Transaction history"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => load(page)}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 active:scale-[.98] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <RefreshIcon spinning={loading} />
            Refresh
          </button>
        </header>

        <div className="overflow-hidden rounded-3xl border border-zinc-200/80 bg-white/80 shadow-xl shadow-zinc-900/5 backdrop-blur-xl dark:border-zinc-800/60 dark:bg-zinc-900/60">
          {error ? (
            <div className="px-6 py-16 text-center">
              <p className="mx-auto max-w-md rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                {error}
              </p>
            </div>
          ) : loading && !data ? (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
              {Array.from({ length: 8 }).map((_, i) => (
                <li key={i} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div className="space-y-2">
                    <div className="h-3.5 w-32 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                    <div className="h-3 w-24 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800/60" />
                  </div>
                  <div className="h-4 w-20 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                </li>
              ))}
            </ul>
          ) : items.length === 0 ? (
            <div className="px-6 py-20 text-center text-sm text-zinc-500 dark:text-zinc-400">
              No transactions yet.
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
              {items.map((t) => (
                <TransactionRow key={t.id || t.reference} t={t} />
              ))}
            </ul>
          )}
        </div>

        {!error && total > 0 && (
          <div className="mt-5 flex items-center justify-between">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Showing <span className="font-medium text-zinc-700 dark:text-zinc-300">{from}</span>–
              <span className="font-medium text-zinc-700 dark:text-zinc-300">{to}</span> of{" "}
              <span className="font-medium text-zinc-700 dark:text-zinc-300">{total.toLocaleString()}</span>
            </p>
            <div className="flex items-center gap-2">
              <PagerButton disabled={page === 0 || loading} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                ‹ Prev
              </PagerButton>
              <span className="px-1 text-sm font-medium tabular-nums text-zinc-600 dark:text-zinc-300">
                {page + 1} / {pageCount}
              </span>
              <PagerButton
                disabled={page >= pageCount - 1 || loading}
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              >
                Next ›
              </PagerButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TransactionRow({ t }: { t: Transaction }) {
  const kind = classifyStatus(t.status);
  const dot =
    kind === "success"
      ? "bg-emerald-500"
      : kind === "failed"
        ? "bg-rose-500"
        : "bg-amber-500";
  const badge =
    kind === "success"
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
      : kind === "failed"
        ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
        : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
  const paid = t.gross_amount ?? t.original_amount ?? t.amount;

  return (
    <li className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
        <div className="min-w-0">
          <p className="truncate font-mono text-sm font-medium">{t.reference}</p>
          <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
            {formatDate(t.created_at)}
            {t.type ? ` · ${t.type}` : ""}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 text-right">
        <div>
          <p className="font-semibold tabular-nums">{formatMoney(paid, t.currency)}</p>
          {typeof t.net_amount === "number" && t.net_amount !== paid && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              net {formatMoney(t.net_amount, t.currency)}
            </p>
          )}
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${badge}`}>
          {t.status.toLowerCase()}
        </span>
      </div>
    </li>
  );
}

function PagerButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="h-10 rounded-xl border border-zinc-200 bg-white px-3.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
    >
      {children}
    </button>
  );
}

function RefreshIcon({ spinning }: { spinning?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-4 w-4 ${spinning ? "animate-spin" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
    </svg>
  );
}

function BackgroundMesh() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute -top-32 left-1/2 h-[420px] w-[620px] -translate-x-1/2 rounded-full bg-indigo-300/25 blur-3xl dark:bg-indigo-700/15" />
      <div className="absolute -bottom-40 right-[-10%] h-[380px] w-[480px] rounded-full bg-emerald-300/20 blur-3xl dark:bg-emerald-600/10" />
    </div>
  );
}
