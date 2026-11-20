"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { buttonClass, inputClass, PlatformChip, primaryButtonClass } from "@/components/ui";
import { bestTimeLabel } from "@/lib/ai/best-times";
import { scorePost } from "@/lib/ai/engagement";
import { ASPECTS, GOALS, IMAGE_MODELS, TEXT_MODELS, TONES, type Aspect, type Goal, type Tone } from "@/lib/ai/models";
import type { PlatformId } from "@/lib/platforms";
import { draftWithAi, generateImageAction, savePost, type DraftOption } from "../actions";

type Account = {
  id: string;
  platform: PlatformId;
  name: string;
  platformName: string;
  color: string;
  maxLength: number | null;
  needsMedia: boolean;
};

const length = (s: string) => [...s].length;
type Tab = "write" | "repurpose" | "image";

export function Composer({ accounts, timeZone, imagesOn }: { accounts: Account[]; timeZone: string; imagesOn: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(accounts.map((a) => a.id));
  const [body, setBody] = useState("");
  const [media, setMedia] = useState("");
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [when, setWhen] = useState("");
  const [generation, setGeneration] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  // AI studio
  const [tab, setTab] = useState<Tab>("write");
  const [topic, setTopic] = useState("");
  const [source, setSource] = useState("");
  const [model, setModel] = useState<string>(TEXT_MODELS[0].id);
  const [tone, setTone] = useState<Tone | "">("");
  const [goal, setGoal] = useState<Goal | "">("engage");
  const [count, setCount] = useState(3);
  const [options, setOptions] = useState<DraftOption[]>([]);
  const [aiError, setAiError] = useState<string | null>(null);
  const [drafting, startDraft] = useTransition();
  const [imagePrompt, setImagePrompt] = useState("");
  const [aspect, setAspect] = useState<Aspect>("1:1");
  const [imageModel, setImageModel] = useState<string>(IMAGE_MODELS[0].id);
  const [imaging, startImage] = useTransition();
  const [focus, setFocus] = useState<string | null>(null);

  const chosen = accounts.filter((a) => selected.includes(a.id));
  const platforms = [...new Set(chosen.map((a) => a.platform))];
  const mediaUrls = media.split(/\s+/).map((s) => s.trim()).filter(Boolean);
  const textFor = (a: Account) => (overrides[a.id]?.trim() ? overrides[a.id] : body);

  // Cheap enough to recompute on every keystroke.
  const scores = chosen.map((a) => ({ account: a, ...scorePost({ text: textFor(a), platform: a.platform, hasMedia: mediaUrls.length > 0 }) }));
  const focused = scores.find((s) => s.account.id === focus) ?? scores[0];
  const overall = scores.length ? Math.round(scores.reduce((n, s) => n + s.score, 0) / scores.length) : 0;

  const write = () =>
    startDraft(async () => {
      setAiError(null);
      const res = await draftWithAi({
        topic,
        platforms,
        model,
        tone: tone || undefined,
        goal: goal || undefined,
        count,
        sourceText: tab === "repurpose" ? source : undefined,
      });
      if (!res.ok) return setAiError(res.error);
      setOptions(res.data ?? []);
    });

  const applyOption = (o: DraftOption) => {
    const tags = o.hashtags.slice(0, 3).join(" ");
    setBody(o.body.includes("#") || !tags ? o.body : `${o.body}\n\n${tags}`);
    setOverrides(Object.fromEntries(chosen.map((a) => [a.id, o.variants[a.platform] ?? ""]).filter(([, v]) => v)));
    setGeneration({ topic: topic || "repurposed", model: o.model, hashtags: o.hashtags, angle: o.angle });
    if (!imagePrompt) setImagePrompt(o.imageIdea);
  };

  const makeImage = () =>
    startImage(async () => {
      setAiError(null);
      const res = await generateImageAction({ prompt: imagePrompt, aspect, model: imageModel });
      if (!res.ok) return setAiError(res.error);
      setMedia((m) => [m.trim(), res.data!.url].filter(Boolean).join("\n"));
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

  const canWrite = platforms.length > 0 && (tab === "repurpose" ? source.trim().length >= 50 : topic.trim().length >= 2);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      {/* Editor */}
      <div className="flex min-w-0 flex-col gap-6">
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Post to</h2>
          <div className="flex flex-wrap gap-2">
            {accounts.map((a) => {
              const on = selected.includes(a.id);
              return (
                <label
                  key={a.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${on ? "border-accent bg-accent/10" : "border-border opacity-60 hover:opacity-100"}`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={on}
                    onChange={(e) => setSelected((s) => (e.target.checked ? [...s, a.id] : s.filter((x) => x !== a.id)))}
                  />
                  <span aria-hidden className="size-2.5 rounded-full" style={{ background: a.color }} />
                  <span className="font-medium">{a.platformName}</span>
                  <span className="text-muted">{a.name}</span>
                  {on && <span aria-hidden className="text-accent">✓</span>}
                </label>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <label className="text-sm font-semibold" htmlFor="body">Post text</label>
          <textarea
            id="body"
            rows={8}
            className={`${inputClass} leading-relaxed`}
            placeholder="Write here, or let the AI Studio write options for you."
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <label className="mt-2 text-sm font-semibold" htmlFor="media">Images or video</label>
          <textarea
            id="media"
            rows={2}
            className={inputClass}
            placeholder="https://… one public link per line. Instagram needs at least one. AI images are added here."
            value={media}
            onChange={(e) => setMedia(e.target.value)}
          />
          {mediaUrls.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {mediaUrls.map((u) => (
                <div key={u} className="group relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="" className="size-20 rounded-lg border border-border object-cover" />
                  <button
                    type="button"
                    aria-label="Remove image"
                    className="absolute -right-1.5 -top-1.5 hidden size-5 rounded-full bg-foreground text-xs text-background group-hover:block"
                    onClick={() => setMedia(mediaUrls.filter((x) => x !== u).join("\n"))}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {chosen.length > 0 && (
          <section className="flex flex-col gap-3">
            <div>
              <h2 className="text-sm font-semibold">Per-platform versions</h2>
              <p className="text-xs text-muted">Leave one empty to use the main text. The AI fills these in for you.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {chosen.map((a) => {
                const text = textFor(a);
                const over = a.maxLength !== null && length(text) > a.maxLength;
                const best = bestTimeLabel(a.platform);
                return (
                  <div key={a.id} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3" style={{ borderTopColor: a.color, borderTopWidth: 3 }}>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{a.platformName}</span>
                      <span className="truncate text-muted">{a.name}</span>
                      <span className={`ml-auto shrink-0 text-xs tabular-nums ${over ? "font-semibold text-red-600" : "text-muted"}`}>
                        {length(text)}{a.maxLength ? ` / ${a.maxLength}` : ""}
                      </span>
                    </div>
                    <textarea
                      rows={4}
                      className={inputClass}
                      placeholder="Uses the main text"
                      value={overrides[a.id] ?? ""}
                      onChange={(e) => setOverrides((o) => ({ ...o, [a.id]: e.target.value }))}
                    />
                    {a.needsMedia && mediaUrls.length === 0 && <p className="text-xs text-amber-600">{a.platformName} needs an image or video.</p>}
                    {best && <p className="text-xs text-muted">Good times to try: {best}</p>}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {error && <p className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm">{error}</p>}

        <section className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">
              Schedule for <span className="font-normal text-muted">(your browser&apos;s time; autopilot uses {timeZone})</span>
            </span>
            <input type="datetime-local" className={inputClass} value={when} onChange={(e) => setWhen(e.target.value)} />
          </label>
          <button type="button" className={primaryButtonClass} disabled={saving || !when || !selected.length} onClick={() => submit("schedule")}>Schedule</button>
          <button type="button" className={buttonClass} disabled={saving || !selected.length} onClick={() => submit("now")}>Publish now</button>
          <button type="button" className={buttonClass} disabled={saving || !selected.length} onClick={() => submit("draft")}>Save draft</button>
        </section>
      </div>

      {/* AI studio + score */}
      <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="bg-gradient-to-br from-accent/20 via-fuchsia-500/10 to-transparent px-4 pb-3 pt-4">
            <h2 className="font-semibold">AI Studio</h2>
            <p className="text-xs text-muted">Pick a model, get options, keep the one that sounds like you.</p>
          </div>
          <div role="tablist" className="flex border-b border-border px-2 text-sm">
            {(["write", "repurpose", "image"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                type="button"
                onClick={() => setTab(t)}
                className={`-mb-px border-b-2 px-3 py-2 capitalize ${tab === t ? "border-accent font-medium" : "border-transparent text-muted hover:text-foreground"}`}
              >
                {t === "write" ? "Write" : t === "repurpose" ? "Repurpose" : "Image"}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3 p-4">
            {tab === "image" ? (
              imagesOn ? (
                <>
                  <textarea rows={3} className={inputClass} placeholder="Describe the image, e.g. flat-lay of fresh pastries on a wooden table, morning light" value={imagePrompt} onChange={(e) => setImagePrompt(e.target.value)} />
                  <div className="grid grid-cols-2 gap-2">
                    <select className={inputClass} value={aspect} onChange={(e) => setAspect(e.target.value as Aspect)} aria-label="Shape">
                      {ASPECTS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                    </select>
                    <select className={inputClass} value={imageModel} onChange={(e) => setImageModel(e.target.value)} aria-label="Image model">
                      {IMAGE_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                    </select>
                  </div>
                  <button type="button" className={primaryButtonClass} disabled={imaging || imagePrompt.trim().length < 3} onClick={makeImage}>
                    {imaging ? "Creating image…" : "Create image"}
                  </button>
                  <p className="text-xs text-muted">The image is added to your post&apos;s media. Takes about 10–30 seconds.</p>
                </>
              ) : (
                <p className="text-sm text-muted">AI images switch on once the app has a Vercel Blob store connected for storing them.</p>
              )
            ) : (
              <>
                {tab === "write" ? (
                  <input className={inputClass} placeholder="What's the post about?" value={topic} onChange={(e) => setTopic(e.target.value)} />
                ) : (
                  <>
                    <textarea rows={5} className={inputClass} placeholder="Paste a blog post, video transcript or newsletter. The AI pulls out the best ideas." value={source} onChange={(e) => setSource(e.target.value)} />
                    <input className={inputClass} placeholder="Focus (optional), e.g. the part about pricing" value={topic} onChange={(e) => setTopic(e.target.value)} />
                  </>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <select className={inputClass} value={goal} onChange={(e) => setGoal(e.target.value as Goal | "")} aria-label="Goal">
                    <option value="">Any goal</option>
                    {GOALS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
                  </select>
                  <select className={inputClass} value={tone} onChange={(e) => setTone(e.target.value as Tone | "")} aria-label="Tone">
                    <option value="">My usual tone</option>
                    {TONES.map((t) => <option key={t} value={t} className="capitalize">{t[0].toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <select className={inputClass} value={model} onChange={(e) => setModel(e.target.value)} aria-label="AI model">
                    {TEXT_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label} · {m.note}</option>)}
                  </select>
                  <select className={inputClass} value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label="Number of options">
                    {[1, 2, 3].map((n) => <option key={n} value={n}>{n} option{n > 1 ? "s" : ""}</option>)}
                  </select>
                </div>
                <button type="button" className={primaryButtonClass} disabled={drafting || !canWrite} onClick={write}>
                  {drafting ? "Writing…" : platforms.length ? `Write ${count > 1 ? `${count} options` : "it"}` : "Pick an account first"}
                </button>
                <p className="text-xs text-muted">Uses the brand voice from your autopilot settings. Read it before you post.</p>
              </>
            )}
            {aiError && <p className="rounded-md border border-red-500/40 bg-red-500/10 p-2 text-xs">{aiError}</p>}
          </div>

          {options.length > 0 && tab !== "image" && (
            <div className="flex flex-col gap-3 border-t border-border p-4">
              {options.map((o, i) => (
                <article key={i} className="flex flex-col gap-2 rounded-xl border border-border bg-background p-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">{o.angle || `Option ${i + 1}`}</span>
                    <span className="ml-auto text-xs text-muted">{scorePost({ text: o.body, hasMedia: true }).score}/100</span>
                  </div>
                  <p className="line-clamp-5 whitespace-pre-line text-sm">{o.body}</p>
                  {o.hashtags.length > 0 && <p className="truncate text-xs text-accent">{o.hashtags.join(" ")}</p>}
                  <button type="button" className={buttonClass} onClick={() => applyOption(o)}>Use this</button>
                </article>
              ))}
            </div>
          )}
        </section>

        {scores.length > 0 && body.trim() && focused && (
          <section className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-4">
              <ScoreRing value={overall} />
              <div>
                <h2 className="font-semibold">Engagement check</h2>
                <p className="text-xs text-muted">Habits that well-performing posts share. A guide, not a guarantee.</p>
              </div>
            </div>
            {scores.length > 1 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {scores.map((s) => (
                  <button key={s.account.id} type="button" onClick={() => setFocus(s.account.id)} className={focused.account.id === s.account.id ? "" : "opacity-60"}>
                    <PlatformChip name={s.account.platformName} color={s.account.color} detail={String(s.score)} />
                  </button>
                ))}
              </div>
            )}
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {focused.checks.map((c) => (
                <li key={c.id} className="flex gap-2">
                  <span aria-hidden className={c.ok ? "text-green-600" : "text-amber-600"}>{c.ok ? "✓" : "○"}</span>
                  <span>
                    <span className={c.ok ? "" : "font-medium"}>{c.label}</span>
                    {!c.ok && <span className="block text-xs text-muted">{c.tip}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </div>
  );
}

function ScoreRing({ value }: { value: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const color = value >= 80 ? "#16a34a" : value >= 55 ? "var(--accent)" : "#d97706";
  return (
    <div className="relative size-14 shrink-0" role="img" aria-label={`Engagement score ${value} out of 100`}>
      <svg viewBox="0 0 56 56" className="size-14 -rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" stroke="var(--border)" strokeWidth="6" />
        <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}
