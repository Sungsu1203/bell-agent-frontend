"use client";

import { useEffect, useMemo, useState } from "react";

type StateResp =
  | {
      ok: true;
      doc_mode?: string | null;
      phase?: string | null;
      iteration_count?: number | null;
      updated_at?: string;
      error?: string;
    }
  | { ok: false; error: string };

export default function StatusBar() {
  const API_BASE = useMemo(
    () => process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000",
    []
  );

  const [s, setS] = useState<StateResp | null>(null);

  useEffect(() => {
    let alive = true;

    async function tick() {
      try {
        const r = await fetch(`${API_BASE}/api/state`, { cache: "no-store" });
        const j = (await r.json()) as StateResp;
        if (!alive) return;
        setS(j);
      } catch (e: any) {
        if (!alive) return;
        setS({ ok: false, error: String(e?.message || e) });
      }
    }

    tick();
    const t = setInterval(tick, 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [API_BASE]);

  const ok = s?.ok === true;
  const docMode = ok ? (s.doc_mode || "-") : "-";
  const phase = ok ? (s.phase || "-") : "-";
  const iter = ok ? (s.iteration_count ?? "-") : "-";
  const err = s && !ok ? s.error : "";

  return (
    <div className="sticky top-0 z-20 border-b bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2 text-xs text-zinc-700">
        <div className="flex items-center gap-2">
          <span className="font-mono">mode:{docMode}</span>
          <span className="font-mono">phase:{phase}</span>
          <span className="font-mono">round:{iter}</span>
        </div>
        <div className="font-mono text-zinc-500">
          {err ? `state error: ${err}` : ok ? (s.updated_at || "") : "loading..."}
        </div>
      </div>
    </div>
  );
}
