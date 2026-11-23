"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const LINKS = [
  { href: "/", label: "New run" },
  { href: "/batch", label: "Batch" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/sellers", label: "Seller profiles" },
  { href: "/how-it-works", label: "How it works" },
];

interface Health {
  llm: string | null;
  exa: boolean;
  tavily: boolean;
  db: string;
  storageProblem: string | null;
  mock: boolean;
}

export function Nav() {
  const path = usePathname();
  const [h, setH] = useState<Health | null>(null);
  useEffect(() => {
    fetch("/api/health").then((r) => r.json()).then(setH).catch(() => {});
  }, []);
  return (
    <header className="border-b border-line bg-paper/80 backdrop-blur sticky top-0 z-20">
      <div className="max-w-[1280px] mx-auto px-6 h-14 flex items-center gap-8">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="inline-grid place-items-center w-7 h-7 rounded-lg bg-ink text-white text-sm">↯</span>
          Hookline
        </Link>
        <nav className="flex gap-1 text-sm">
          {LINKS.map((l) => {
            const active = l.href === "/" ? path === "/" || path.startsWith("/runs") : path.startsWith(l.href);
            return (
              <Link key={l.href} href={l.href} className={`px-3 py-1.5 rounded-lg transition ${active ? "bg-ink text-white" : "text-muted hover:text-ink hover:bg-white"}`}>
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto text-xs flex items-center gap-2">
          {h &&
            (h.mock ? (
              <span className="px-2 py-1 rounded-md bg-warn-soft text-warn font-medium" title="No API keys found — using fictional sample data. Add keys to .env.local for live runs.">
                MOCK MODE · sample data
              </span>
            ) : (
              <span className="px-2 py-1 rounded-md bg-good-soft text-good font-medium" title={`LLM: ${h.llm} · search: ${[h.exa && "Exa", h.tavily && "Tavily"].filter(Boolean).join(" + ")} · store: ${h.db}`}>
                ● LIVE · {h.llm} · {[h.exa && "Exa", h.tavily && "Tavily"].filter(Boolean).join("+")}
              </span>
            ))}
        </div>
      </div>
      {h?.storageProblem && <div className="bg-bad-soft text-bad text-sm text-center px-6 py-2">Runs are disabled: {h.storageProblem}</div>}
    </header>
  );
}
