"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { buttonClass, primaryButtonClass } from "@/components/ui";
import { refreshStatsAction, applyLearnedTimesAction } from "../actions";

export function RefreshStatsButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        className={buttonClass}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await refreshStatsAction();
            setNote(r.ok ? (r.data!.updated ? `Updated ${r.data!.updated} post(s)` : "Everything is up to date") : r.error);
            router.refresh();
          })
        }
      >
        {pending ? "Refreshing…" : "Refresh stats"}
      </button>
      {note && <span className="text-xs text-muted">{note}</span>}
    </span>
  );
}

export function UseLearnedTimesButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  return (
    <span className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className={primaryButtonClass}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await applyLearnedTimesAction();
            setNote(r.ok ? `Autopilot now posts at these ${r.data!.slots} times.` : r.error);
            router.refresh();
          })
        }
      >
        {pending ? "Saving…" : "Use these times in autopilot"}
      </button>
      {note && <span className="text-xs text-muted">{note}</span>}
    </span>
  );
}
