"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const NAV = [
  { href: "/pay", label: "Payment", icon: CardIcon },
  { href: "/pay/transactions", label: "Transactions", icon: ListIcon },
];

export default function TerminalChrome() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      /* fullscreen may be blocked — ignore */
    }
  };

  return (
    <>
      {/* Top-left: menu */}
      <div className="fixed left-4 top-4 z-50">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Menu"
          aria-expanded={menuOpen}
          className="flex h-11 w-11 items-center justify-center rounded-2xl border border-zinc-200/80 bg-white/80 text-zinc-700 shadow-lg shadow-zinc-900/5 backdrop-blur-xl transition hover:bg-white active:scale-95 dark:border-zinc-700/60 dark:bg-zinc-900/70 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          {menuOpen ? <CloseIcon /> : <MenuIcon />}
        </button>

        {menuOpen && (
          <>
            <button
              aria-hidden
              tabIndex={-1}
              onClick={() => setMenuOpen(false)}
              className="fixed inset-0 z-40 cursor-default"
            />
            <nav
              className="absolute left-0 z-50 mt-2 w-52 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/90 p-1.5 shadow-xl shadow-zinc-900/10 backdrop-blur-xl dark:border-zinc-700/60 dark:bg-zinc-900/85"
              style={{ animation: "fadeIn 160ms ease-out both" }}
            >
              {NAV.map(({ href, label, icon: Icon }) => {
                const active = pathname === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                      active
                        ? "bg-indigo-600 text-white shadow-sm shadow-indigo-500/30"
                        : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    }`}
                  >
                    <Icon />
                    {label}
                  </Link>
                );
              })}
            </nav>
          </>
        )}
      </div>

      {/* Top-right: fullscreen */}
      <button
        type="button"
        onClick={toggleFullscreen}
        aria-label={isFullscreen ? "Exit full screen" : "Enter full screen"}
        className="fixed right-4 top-4 z-50 flex h-11 w-11 items-center justify-center rounded-2xl border border-zinc-200/80 bg-white/80 text-zinc-700 shadow-lg shadow-zinc-900/5 backdrop-blur-xl transition hover:bg-white active:scale-95 dark:border-zinc-700/60 dark:bg-zinc-900/70 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        {isFullscreen ? <CompressIcon /> : <ExpandIcon />}
      </button>
    </>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
function ExpandIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}
function CompressIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h3a1 1 0 0 0 1-1V4M16 4v3a1 1 0 0 0 1 1h3M20 16h-3a1 1 0 0 0-1 1v3M8 20v-3a1 1 0 0 0-1-1H4" />
    </svg>
  );
}
function CardIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </svg>
  );
}
function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}
