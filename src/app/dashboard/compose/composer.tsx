"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { buttonClass, inputClass, primaryButtonClass } from "@/components/ui";
import { draftWithAi, savePost } from "../actions";

type Account = { id: string; platform: string; name: string; platformName: string; maxLength: number | null; needsMedia: boolean };

const length = (s: string) => [...s].length;

export function Composer({ accounts, timeZone }: { accounts: Account[]; timeZone: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(accounts.map((a) => a.id));
  const [body, setBody] = useState("");
  const [media, setMedia] = useState("");
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [topic, setTopic] = useState("");
  const [when, setWhen] = useState("");
  const [generation, setGeneration] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafting, startDraft] = useTransition();
  const [saving, startSave] = useTransition();

  const chosen = accounts.filter((a) => selected.includes(a.id));
  const mediaUrls = media.split(/\s+/).map((s) => s.trim()).filter(Boolean);

  const draft = () =>
    startDraft(async () => {
      setError(null);
      const res = await draftWithAi({ topic, platforms: [...new Set(chosen.map((a) => a.platform))] });
      if (!res.ok) return setError(res.error);
      const d = res.data!;
      setBody(d.body);
      setOverrides(Object.fromEntries(chosen.map((a) => [a.id, d.variants[a.platform as keyof typeof d.variants] ?? ""]).filter(([, v]) => v)));
      setGeneration({ topic, model: d.model, hashtags: d.hashtags });
    });

  const submit = (mode: "draft" | "schedule" | "now") =>
    startSave(async () => {
      setError(null);
      const res = await savePost({
        body,
        mediaUrls,
        accountIds: selected,
        overrides: Object.fromEntries(Object.entries(overrides).filter(([id, v]) => selected.includes(id) && v.trim())),
        scheduledAt: mode === "schedule" && when ? new Date(when).toISOString() : null,
        mode,
        generation,
      });
      if (!res.ok) return setError(res.error);
      router.push(mode === "draft" ? "/dashboard/posts?tab=drafts" : mode === "now" ? "/dashboard/posts?tab=all" : "/dashboard/posts?tab=scheduled");
    });

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Post to</h2>
        <div className="flex flex-wrap gap-2">
          {accounts.map((a) => (
            <label key={a.id} className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-sm ${selected.includes(a.id) ? "border-accent" : "border-border opacity-60"}`}>
              <input
                type="checkbox"
                className="accent-[var(--accent)]"
                checked={selected.includes(a.id)}
                onChange={(e) => setSelected((s) => (e.target.checked ? [...s, a.id] : s.filter((x) => x !== a.id)))}
              />
              {a.platformName} · {a.name}
            </label>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Draft with AI</h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input className={inputClass} placeholder="What's the post about? e.g. our new community workshop on Saturday" value={topic} onChange={(e) => setTopic(e.target.value)} />
          <button type="button" className={primaryButtonClass} disabled={drafting || !topic.trim() || !chosen.length} onClick={draft}>
            {drafting ? "Writing…" : "Write it"}
          </button>
        </div>
        <p className="text-xs text-muted">Uses the brand voice from your autopilot settings. Always read it before posting.</p>
      </section>

      <section className="flex flex-col gap-2">
        <label className="text-sm font-semibold" htmlFor="body">Post text</label>
        <textarea id="body" rows={6} className={inputClass} value={body} onChange={(e) => setBody(e.target.value)} />
        <label className="text-sm font-semibold" htmlFor="media">Image or video links (optional)</label>
        <textarea id="media" rows={2} className={inputClass} placeholder="https://… one per line. Must be public links; Instagram needs at least one." value={media} onChange={(e) => setMedia(e.target.value)} />
      </section>

      {chosen.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Per-platform versions</h2>
          {chosen.map((a) => {
            const text = overrides[a.id]?.trim() ? overrides[a.id] : body;
            const over = a.maxLength !== null && length(text) > a.maxLength;
            return (
              <div key={a.id} className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{a.platformName}</span>
                  <span className="text-muted">{a.name}</span>
                  <span className={`ml-auto text-xs ${over ? "text-red-600" : "text-muted"}`}>
                    {length(text)}{a.maxLength ? ` / ${a.maxLength}` : ""}
                  </span>
                </div>
                <textarea
                  rows={3}
                  className={inputClass}
                  placeholder="Leave empty to use the main text"
                  value={overrides[a.id] ?? ""}
                  onChange={(e) => setOverrides((o) => ({ ...o, [a.id]: e.target.value }))}
                />
                {a.needsMedia && mediaUrls.length === 0 && <p className="text-xs text-amber-600">{a.platformName} needs an image or video link.</p>}
              </div>
            );
          })}
        </section>
      )}

      {error && <p className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm">{error}</p>}

      <section className="flex flex-wrap items-end gap-3 border-t border-border pt-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">Schedule for <span className="font-normal text-muted">(your browser&apos;s time; autopilot uses {timeZone})</span></span>
          <input type="datetime-local" className={inputClass} value={when} onChange={(e) => setWhen(e.target.value)} />
        </label>
        <button type="button" className={primaryButtonClass} disabled={saving || !when || !selected.length} onClick={() => submit("schedule")}>Schedule</button>
        <button type="button" className={buttonClass} disabled={saving || !selected.length} onClick={() => submit("now")}>Publish now</button>
        <button type="button" className={buttonClass} disabled={saving || !selected.length} onClick={() => submit("draft")}>Save draft</button>
      </section>
    </div>
  );
}
