"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { buttonClass, inputClass, primaryButtonClass } from "@/components/ui";
import type { AutopilotSlot } from "@/db/schema";
import { suggestedSlots } from "@/lib/ai/best-times";
import type { PlatformId } from "@/lib/platforms";
import { runAutopilotNowAction, saveAutopilotAction } from "../actions";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Settings = {
  enabled: boolean;
  timezone: string;
  slots: AutopilotSlot[];
  accountIds: string[];
  brandVoice: string;
  topics: string[];
  requireApproval: boolean;
  horizonDays: number;
  writer: "app" | "agent";
};

type Account = { id: string; label: string; platform: PlatformId; textCapable: boolean; active: boolean };

export function AutopilotForm({ initial, accounts }: { initial: Settings; accounts: Account[] }) {
  const router = useRouter();
  const [s, setS] = useState<Settings>(initial);
  const [topicsText, setTopicsText] = useState(initial.topics.join("\n"));
  const [newDays, setNewDays] = useState<number[]>([1, 3, 5]);
  const [newTime, setNewTime] = useState("09:00");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((x) => ({ ...x, [k]: v }));

  const addSlots = () => {
    const add = newDays.map((day) => ({ day, time: newTime })).filter((n) => !s.slots.some((x) => x.day === n.day && x.time === n.time));
    set("slots", [...s.slots, ...add].sort((a, b) => a.day - b.day || a.time.localeCompare(b.time)));
  };

  const useSuggested = () => {
    const picked = accounts.filter((a) => s.accountIds.includes(a.id) && a.textCapable);
    set("slots", suggestedSlots((picked.length ? picked : accounts).map((a) => a.platform)));
  };

  const save = () =>
    start(async () => {
      const res = await saveAutopilotAction({ ...s, topics: topicsText.split("\n").map((t) => t.trim()).filter(Boolean) });
      setMessage(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error });
      router.refresh();
    });

  const runNow = () =>
    start(async () => {
      const res = await runAutopilotNowAction();
      if (!res.ok) return setMessage({ ok: false, text: res.error });
      const { created, note } = res.data!;
      if (initial.writer === "agent") setMessage({ ok: true, text: note ? `Nothing sent (${note}).` : "Done. Your agent can see your open times now, and any webhooks were sent." });
      else setMessage({ ok: true, text: created ? `Drafted ${created} post(s). See Posts.` : `Nothing new to draft${note ? ` (${note})` : ": upcoming slots are already filled"}.` });
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-6">
      <label className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
        <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={s.enabled} onChange={(e) => set("enabled", e.target.checked)} />
        <span>
          <span className="font-semibold">Autopilot {s.enabled ? "on" : "off"}</span>
          <span className="block text-sm text-muted">Runs every few minutes: publishes what&apos;s due and drafts posts for empty slots.</span>
        </span>
      </label>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Who writes the posts</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["app", "This app's AI", "Autopilot writes drafts in your voice for each open time."],
              ["agent", "My own AI agent", "Claude, ChatGPT, Cursor or your own workflow writes them. Autopilot keeps the schedule and publishes."],
            ] as const
          ).map(([value, title, note]) => (
            <label key={value} className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-sm ${s.writer === value ? "border-accent bg-card" : "border-border"}`}>
              <input type="radio" name="writer" className="mt-1 accent-[var(--accent)]" checked={s.writer === value} onChange={() => set("writer", value)} />
              <span>
                <span className="font-medium">{title}</span>
                <span className="block text-muted">{note}</span>
              </span>
            </label>
          ))}
        </div>
        {s.writer === "agent" && (
          <p className="text-xs text-muted">
            Set up your agent on the <a href="/dashboard/agents" className="text-accent underline">AI agents</a> page. Your voice, topics and approval setting below are shared with it.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Posting times</h2>
        <label className="text-sm">
          Time zone{" "}
          <input className={`${inputClass} mt-1 max-w-xs`} value={s.timezone} onChange={(e) => set("timezone", e.target.value)} />
        </label>
        <button type="button" className="self-start text-xs text-accent underline" onClick={() => set("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone)}>
          Use this device&apos;s time zone
        </button>
        <div className="flex flex-wrap items-center gap-2">
          {DAYS.map((d, i) => (
            <button
              key={d}
              type="button"
              onClick={() => setNewDays((x) => (x.includes(i) ? x.filter((y) => y !== i) : [...x, i]))}
              className={`rounded-full px-3 py-1 text-sm ${newDays.includes(i) ? "bg-accent text-white" : "border border-border"}`}
            >
              {d}
            </button>
          ))}
          <input type="time" className={`${inputClass} w-32`} value={newTime} onChange={(e) => setNewTime(e.target.value)} />
          <button type="button" className={buttonClass} onClick={addSlots} disabled={!newDays.length || !newTime}>Add time</button>
          <button type="button" className={buttonClass} onClick={useSuggested} disabled={!accounts.length}>✨ Use suggested times</button>
        </div>
        <p className="text-xs text-muted">
          Suggested times are common peak hours for your selected platforms. Once you have results,{" "}
          <a href="/dashboard/analytics" className="text-accent underline">Analytics</a> learns your own best times.
        </p>
        {s.slots.length === 0 ? (
          <p className="text-sm text-muted">No posting times yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {s.slots.map((slot) => (
              <li key={`${slot.day}-${slot.time}`} className="flex items-center gap-2 rounded-full border border-border px-3 py-1 text-sm">
                {DAYS[slot.day]} {slot.time}
                <button type="button" aria-label="Remove" className="text-muted hover:text-foreground" onClick={() => set("slots", s.slots.filter((x) => x !== slot))}>×</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Post to</h2>
        {accounts.length === 0 && <p className="text-sm text-muted">Connect accounts first.</p>}
        {accounts.map((a) => (
          <label key={a.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-[var(--accent)]"
              checked={s.accountIds.includes(a.id)}
              onChange={(e) => set("accountIds", e.target.checked ? [...s.accountIds, a.id] : s.accountIds.filter((x) => x !== a.id))}
            />
            {a.label}
            {!a.active && <span className="text-xs text-amber-600">needs reconnecting</span>}
            {!a.textCapable && (
              <span className="text-xs text-muted">
                {s.writer === "agent" ? "(needs an image or video: your agent must include one)" : "(needs media, so autopilot skips it; post to it from Compose)"}
              </span>
            )}
          </label>
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Your voice</h2>
        <textarea
          rows={3}
          className={inputClass}
          placeholder="Who you are, who you talk to, how you sound. e.g. Bilingual (English/Spanish) community baker in Houston; friendly, practical, no slang."
          value={s.brandVoice}
          onChange={(e) => set("brandVoice", e.target.value)}
        />
        <h2 className="font-semibold">Topics to rotate through</h2>
        <textarea rows={4} className={inputClass} placeholder={"One per line, e.g.\nBehind the scenes\nCustomer stories\nWeekly specials"} value={topicsText} onChange={(e) => setTopicsText(e.target.value)} />
      </section>

      <section className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="accent-[var(--accent)]" checked={s.requireApproval} onChange={(e) => set("requireApproval", e.target.checked)} />
          Ask me to approve each {s.writer === "agent" ? "post from my agent" : "AI draft"} before it&apos;s scheduled (recommended)
        </label>
        <label className="flex items-center gap-2 text-sm">
          Keep the next
          <input type="number" min={1} max={30} className={`${inputClass} w-20`} value={s.horizonDays} onChange={(e) => set("horizonDays", Math.max(1, Math.min(30, Number(e.target.value) || 7)))} />
          days filled
        </label>
      </section>

      {message && <p className={`rounded-md p-3 text-sm ${message.ok ? "bg-green-500/10" : "border border-red-500/40 bg-red-500/10"}`}>{message.text}</p>}

      <div className="flex flex-wrap gap-3 border-t border-border pt-4">
        <button type="button" className={primaryButtonClass} disabled={pending} onClick={save}>{pending ? "Working…" : "Save"}</button>
        <button type="button" className={buttonClass} disabled={pending || !initial.enabled} onClick={runNow}>
          {initial.writer === "agent" ? "Tell my agent about open times now" : "Draft upcoming posts now"}
        </button>
      </div>
    </div>
  );
}
