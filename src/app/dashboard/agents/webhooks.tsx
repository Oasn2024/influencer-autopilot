"use client";

import { useState, useTransition } from "react";
import { buttonClass, formatWhen, inputClass, primaryButtonClass } from "@/components/ui";
import { createWebhookAction, deleteWebhookAction, testWebhookAction, toggleWebhookAction } from "../actions";

type Hook = { id: string; url: string; events: string[]; enabled: boolean; lastStatus: number | null; lastError: string | null; lastDeliveredAt: Date | null; failureCount: number };
type EventDef = { id: string; label: string };

export function Webhooks({ hooks, events, max }: { hooks: Hook[]; events: readonly EventDef[]; max: number }) {
  const [url, setUrl] = useState("");
  const [picked, setPicked] = useState<string[]>(["autopilot.slots_open", "post.failed"]);
  const [secret, setSecret] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const add = () =>
    start(async () => {
      const res = await createWebhookAction({ url, events: picked as never });
      if (!res.ok) return setMsg({ ok: false, text: res.error });
      setSecret(res.data!.secret);
      setUrl("");
      setMsg(null);
    });

  const test = (id: string) =>
    start(async () => {
      const res = await testWebhookAction(id);
      setMsg(res.ok ? { ok: true, text: `Test delivered (your endpoint answered ${res.data!.status}).` } : { ok: false, text: `Test failed: ${res.error}` });
    });

  return (
    <div className="flex flex-col gap-3">
      {hooks.length < max && (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
          <input className={inputClass} placeholder="https://your-agent.example.com/webhook" value={url} onChange={(e) => setUrl(e.target.value)} />
          <fieldset className="flex flex-col gap-1 text-sm">
            <legend className="mb-1 text-xs text-muted">Send me these events (none ticked sends all)</legend>
            {events.map((e) => (
              <label key={e.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="accent-[var(--accent)]"
                  checked={picked.includes(e.id)}
                  onChange={(ev) => setPicked((p) => (ev.target.checked ? [...p, e.id] : p.filter((x) => x !== e.id)))}
                />
                <code className="text-xs">{e.id}</code> <span className="text-muted">{e.label}</span>
              </label>
            ))}
          </fieldset>
          <button type="button" className={`${primaryButtonClass} self-start`} disabled={pending || !url.trim()} onClick={add}>Add webhook</button>
        </div>
      )}

      {secret && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <p className="mb-2 font-medium">Copy this signing secret now. It won&apos;t be shown again.</p>
          <code className="block break-all rounded bg-background p-2 text-xs">{secret}</code>
          <p className="mt-2 text-xs text-muted">Each request has an <code>X-IAP-Signature: t=…,v1=…</code> header: an HMAC-SHA256 of <code>t + &quot;.&quot; + body</code> with this secret.</p>
        </div>
      )}
      {msg && <p className={`rounded-md p-3 text-sm ${msg.ok ? "bg-green-500/10" : "border border-red-500/40 bg-red-500/10"}`}>{msg.text}</p>}

      {hooks.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border text-sm">
          {hooks.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="break-all font-medium">{h.url}</p>
                <p className="text-xs text-muted">
                  {h.events.length ? h.events.join(", ") : "all events"} ·{" "}
                  {!h.enabled ? "off" : h.lastError ? `last try failed: ${h.lastError}` : h.lastDeliveredAt ? `last delivered ${formatWhen(h.lastDeliveredAt)}` : "nothing sent yet"}
                  {!h.enabled && h.failureCount > 0 ? ` (switched off after ${h.failureCount} failures)` : ""}
                </p>
              </div>
              <button type="button" className={buttonClass} disabled={pending || !h.enabled} onClick={() => test(h.id)}>Send test</button>
              <form action={toggleWebhookAction}>
                <input type="hidden" name="id" value={h.id} />
                <input type="hidden" name="enabled" value={String(!h.enabled)} />
                <button className={buttonClass}>{h.enabled ? "Turn off" : "Turn on"}</button>
              </form>
              <form action={deleteWebhookAction}>
                <input type="hidden" name="id" value={h.id} />
                <button className={buttonClass}>Delete</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
