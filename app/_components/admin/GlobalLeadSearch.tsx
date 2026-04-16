"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/app/_components/auth/AuthProvider";
import { searchLeads, type LeadSearchHit } from "@/app/(admin)/_lib/leaseCrmSupabase";
import { canAccessAdminPage } from "@/app/(admin)/_lib/rolePermissions";
import toast from "react-hot-toast";
import { useLeadDetailModal } from "./AdminShell";

const RECENT_KEY = "crm.global_search_recent.v1";
const MAX_RECENT = 5;
const DEBOUNCE_MS = 300;

function loadRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string").slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

function saveRecent(items: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(items.slice(0, MAX_RECENT)));
  } catch {
    /* ignore */
  }
}

function pushRecentKeyword(keyword: string) {
  const t = keyword.trim();
  if (t.length < 1) return;
  const prev = loadRecent().filter((x) => x.toLowerCase() !== t.toLowerCase());
  saveRecent([t, ...prev].slice(0, MAX_RECENT));
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function GlobalLeadSearch({
  className = "",
  variant = "header",
  value,
  onChange,
}: {
  className?: string;
  variant?: "header" | "sidebar";
  value: string;
  onChange: (next: string) => void;
}) {
  const { profile } = useAuth();
  const pathname = usePathname();
  const { openLeadById } = useLeadDetailModal();
  const scope = useMemo(
    () =>
      profile
        ? {
            role: profile.role,
            userId: profile.userId,
            email: profile.email ?? null,
            rank: profile.rank ?? null,
            teamName: profile.teamName ?? null,
            operationalFullAccess:
              canAccessAdminPage({
                role: profile.role,
                rank: profile.rank ?? null,
                email: profile.email ?? null,
                team_name: profile.teamName ?? null,
              }) && (pathname?.startsWith("/operations") ?? false),
          }
        : null,
    [profile, pathname]
  );

  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState<LeadSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [recent, setRecent] = useState<string[]>([]);

  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRecent(loadRecent());
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value.trim()), DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [value]);

  useEffect(() => {
    if (!scope || debounced.length < 1) {
      setResults([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const hits = await searchLeads(debounced, scope);
        if (!cancelled) setResults(hits);
      } catch (e) {
        if (!cancelled) {
          setResults([]);
          toast.error(e instanceof Error ? e.message : "검색 중 오류가 발생했습니다.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debounced, scope]);

  useEffect(() => {
    setActiveIdx(-1);
  }, [results]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setActiveIdx(-1);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const showDropdown = open && (value.trim().length > 0 || recent.length > 0);
  const listForKb = debounced.length >= 1 ? results : [];

  const openLead = useCallback(
    (hit: LeadSearchHit) => {
      setOpen(false);
      setActiveIdx(-1);
      void openLeadById(hit.id);
    },
    [openLeadById]
  );

  const pickHit = useCallback(
    (hit: LeadSearchHit) => {
      pushRecentKeyword(debounced || value.trim());
      setRecent(loadRecent());
      openLead(hit);
    },
    [openLead, debounced, value]
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      setActiveIdx(-1);
      return;
    }

    if (!showDropdown) return;

    if (listForKb.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % listForKb.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (i <= 0 ? listForKb.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      if (activeIdx >= 0 && activeIdx < listForKb.length) {
        e.preventDefault();
        pickHit(listForKb[activeIdx]!);
      }
    }
  };

  const applyRecent = (q: string) => {
    onChange(q);
    setOpen(true);
    inputRef.current?.focus({ preventScroll: true });
  };

  const inputClass =
    variant === "sidebar"
      ? cn(
          "w-full rounded-xl border py-3 pl-10 pr-3 text-[14px] font-medium outline-none transition-[border-color,box-shadow,background]",
          "border-white/18 bg-white/[0.1] text-white placeholder:text-slate-400",
          "focus:border-sky-400/60 focus:bg-white/[0.14] focus:shadow-[0_0_0_4px_rgba(56,189,248,0.16)]"
        )
      : cn(
          "w-full rounded-xl border border-slate-300/90 bg-white/95 py-2.5 pl-9 pr-3 text-[14px] font-medium text-slate-900 outline-none transition-[border-color,box-shadow,background]",
          "placeholder:text-slate-400 focus:border-[var(--crm-blue)] focus:bg-white focus:shadow-[0_0_0_4px_rgba(37,99,235,0.14)]",
          "dark:border-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-sky-500"
        );

  if (!profile) return null;

  return (
    <>
      <div ref={wrapRef} className={cn("relative z-40 w-full min-w-0", className)}>
        <label htmlFor="global-lead-search" className="sr-only">
          고객명 또는 연락처 검색
        </label>
        <div className="relative">
          <input
            ref={inputRef}
            id="global-lead-search"
            type="search"
            autoComplete="off"
            placeholder="고객명 또는 연락처 검색"
            disabled={!scope}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setOpen(true);
              setActiveIdx(-1);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            className={inputClass}
            role="combobox"
            aria-expanded={showDropdown}
            aria-controls="global-lead-search-listbox"
            aria-activedescendant={
              activeIdx >= 0 && listForKb[activeIdx]
                ? `global-lead-search-opt-${listForKb[activeIdx]!.id}`
                : undefined
            }
          />
          <span
            className={cn(
              "pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2",
              variant === "sidebar" ? "text-slate-400" : "text-slate-400 dark:text-zinc-500"
            )}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden className="size-4">
              <path
                d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          {loading ? (
            <span
              className={cn(
                "absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium",
                variant === "sidebar" ? "text-slate-400" : "text-slate-400 dark:text-zinc-500"
              )}
            >
              검색 중…
            </span>
          ) : null}
        </div>

        {showDropdown ? (
          <div
            id="global-lead-search-listbox"
            role="listbox"
            className={cn(
              "absolute left-0 right-0 top-[calc(100%+10px)] max-h-[min(70vh,380px)] overflow-auto rounded-xl border py-1 shadow-xl",
              variant === "sidebar"
                ? "border-white/10 bg-[#0c1e36] text-slate-100 shadow-black/40"
                : "border-slate-200 bg-white dark:border-zinc-700 dark:bg-zinc-950"
            )}
          >
            {value.trim().length === 0 && recent.length > 0 ? (
              <div
                className={cn(
                  "border-b px-3 py-2",
                  variant === "sidebar" ? "border-white/10" : "border-slate-100 dark:border-zinc-800"
                )}
              >
                <div
                  className={cn(
                    "text-[10px] font-bold uppercase tracking-wider",
                    variant === "sidebar" ? "text-slate-500" : "text-slate-400 dark:text-zinc-500"
                  )}
                >
                  최근 검색어
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {recent.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => applyRecent(r)}
                      className={cn(
                        "rounded-lg border px-2 py-1 text-xs font-medium transition-colors",
                        variant === "sidebar"
                          ? "border-white/15 bg-white/5 text-slate-200 hover:bg-white/10"
                          : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {value.trim().length > 0 && debounced.length >= 1 ? (
              results.length === 0 && !loading ? (
                <div
                  className={cn(
                    "px-3 py-8 text-center text-sm",
                    variant === "sidebar" ? "text-slate-400" : "text-slate-500 dark:text-zinc-400"
                  )}
                >
                  검색 결과가 없습니다.
                </div>
              ) : (
                <ul className="py-1">
                  {results.map((hit, idx) => {
                    const active = idx === activeIdx;
                    return (
                      <li key={hit.id} role="none">
                        <button
                          type="button"
                          id={`global-lead-search-opt-${hit.id}`}
                          role="option"
                          aria-selected={active}
                          onMouseEnter={() => setActiveIdx(idx)}
                          onClick={() => pickHit(hit)}
                          className={cn(
                            "flex w-full flex-col gap-0.5 px-3 py-2.5 text-left text-sm transition-colors",
                            active
                              ? variant === "sidebar"
                                ? "bg-sky-500/20 ring-1 ring-inset ring-sky-400/25"
                                : "bg-[var(--crm-blue)]/12 dark:bg-sky-500/15"
                              : variant === "sidebar"
                                ? "hover:bg-white/[0.06]"
                                : "hover:bg-slate-50 dark:hover:bg-zinc-900"
                          )}
                        >
                          <span
                            className={cn(
                              "font-semibold",
                              variant === "sidebar" ? "text-white" : "text-slate-900 dark:text-zinc-50"
                            )}
                          >
                            {hit.customerName}
                          </span>
                          <span
                            className={cn(
                              "font-mono text-xs tabular-nums",
                              variant === "sidebar" ? "text-slate-300" : "text-slate-600 dark:text-zinc-400"
                            )}
                          >
                            {hit.phone}
                          </span>
                          <div
                            className={cn(
                              "flex flex-wrap gap-x-2 text-[11px] font-medium",
                              variant === "sidebar" ? "text-slate-400" : "text-slate-500 dark:text-zinc-500"
                            )}
                          >
                            <span>상담 · {hit.status || "—"}</span>
                            {hit.manager ? <span>담당 · {hit.manager}</span> : null}
                            {hit.source ? <span>유입 · {hit.source}</span> : null}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )
            ) : null}
          </div>
        ) : null}
      </div>

    </>
  );
}
