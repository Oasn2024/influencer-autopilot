import Link from "next/link";
import { Show } from "@clerk/nextjs";
import { PlatformChip } from "@/components/ui";
import { TEXT_MODELS } from "@/lib/ai/models";
import { PLATFORMS } from "@/lib/platforms";

const live = Object.values(PLATFORMS).filter((p) => p.available);
const soon = Object.values(PLATFORMS).filter((p) => !p.available);

const pains = [
  {
    title: "One flat price, any number of accounts",
    them: "Most schedulers charge per channel or per seat, so the bill grows as you grow.",
    us: "Flat creator plans. Add your 10th account without a surprise invoice.",
  },
  {
    title: "Posts that actually go out",
    them: "Creators report posts that silently fail, or get stuck until someone retries.",
    us: "Automatic retries, a live Monitor, and alerts the moment an account needs reconnecting.",
  },
  {
    title: "AI that sounds like you",
    them: "Built-in AI captions are generic and the same for every platform.",
    us: "Your brand voice, tone and goal, 3 options per idea, and a tailored version for each platform.",
  },
  {
    title: "Know what will land",
    them: "Analytics that show numbers but not what to change.",
    us: "An engagement check on every post with plain tips, plus suggested posting times.",
  },
];

const features = [
  { icon: "✦", title: "AI Studio", text: "Write with Claude, GPT or Gemini. Pick a goal and a tone, get three different angles, keep the best." },
  { icon: "⇄", title: "Repurpose anything", text: "Paste a blog post, video transcript or newsletter and get ready-to-post versions for every platform." },
  { icon: "◐", title: "AI images", text: "Describe the picture you want and get a feed, portrait, story or wide image in seconds." },
  { icon: "⟳", title: "Autopilot", text: "Set weekly posting times and topics. AI keeps your calendar full and waits for your approval if you want." },
  { icon: "▦", title: "Content calendar", text: "See your whole week at a glance, colour-coded by platform, with drafts waiting for approval." },
  { icon: "🔒", title: "Secure by default", text: "Platform tokens are encrypted with AES-256-GCM. We never see your passwords, and you can disconnect any time." },
];

const tiers = [
  { name: "Starter", for: "Trying it out", items: ["3 connected accounts", "Scheduling and publishing", "AI writing in your voice", "Engagement check"] },
  { name: "Creator", for: "Growing creators", highlight: true, items: ["Unlimited accounts, one price", "Autopilot with approvals", "Claude, GPT and Gemini", "AI images and repurposing", "Content calendar"] },
  { name: "Team", for: "Small brands and agencies", items: ["Everything in Creator", "Developer API and keys", "Priority support", "More AI usage"] },
];

const faqs = [
  { q: "Is it really free?", a: "Yes, everything is free during the beta. When paid plans start they'll be flat per workspace, never per channel, and we'll tell you before anything changes." },
  { q: "Do you store my social media passwords?", a: "No. You sign in on each platform's own page and we only keep the access token it gives us, encrypted. You can disconnect at any time." },
  { q: "Will autopilot post without me checking?", a: "Only if you want it to. By default every AI draft waits for your approval before it's scheduled." },
  { q: "Which AI does it use?", a: `You choose: ${TEXT_MODELS.map((m) => m.label).join(", ")}. Switch per post to find the voice you like.` },
];

function Cta() {
  return (
    <div className="flex flex-wrap gap-3">
      <Show when="signed-out">
        <Link href="/sign-up" className="bg-brand rounded-xl px-6 py-3 font-semibold text-white shadow-lg shadow-accent/25 hover:opacity-90">Start free</Link>
        <Link href="/sign-in" className="rounded-xl border border-border bg-card px-6 py-3 font-semibold hover:border-accent/50">Sign in</Link>
      </Show>
      <Show when="signed-in">
        <Link href="/dashboard" className="bg-brand rounded-xl px-6 py-3 font-semibold text-white shadow-lg shadow-accent/25 hover:opacity-90">Open dashboard</Link>
      </Show>
    </div>
  );
}

export default function Home() {
  return (
    <div className="overflow-x-hidden">
      <header className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-5">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span aria-hidden className="bg-brand grid size-8 place-items-center rounded-lg text-white">✦</span>
          Influencer Autopilot
        </Link>
        <nav className="ml-auto hidden gap-6 text-sm text-muted sm:flex">
          <a href="#features" className="hover:text-foreground">Features</a>
          <a href="#pricing" className="hover:text-foreground">Pricing</a>
          <a href="#faq" className="hover:text-foreground">FAQ</a>
        </nav>
        <Show when="signed-out">
          <Link href="/sign-in" className="ml-auto text-sm font-medium sm:ml-0">Sign in</Link>
        </Show>
      </header>

      <main>
        {/* Hero */}
        <section className="relative">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-24 -z-10 mx-auto h-[28rem] max-w-4xl rounded-full bg-gradient-to-tr from-accent/25 via-accent-2/20 to-transparent blur-3xl" />
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:py-24 lg:grid-cols-[1.1fr_1fr]">
            <div className="flex flex-col gap-6">
              <span className="w-fit rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">Free during beta · no card needed</span>
              <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
                Post everywhere. <span className="text-gradient">Sound like you.</span> Stay on top.
              </h1>
              <p className="max-w-xl text-lg text-muted">
                The AI content studio and autopilot for creators. Write with Claude, GPT or Gemini in your own voice, get a version tailored for
                every platform, and publish on schedule with retries and alerts so nothing silently fails.
              </p>
              <Cta />
              <div className="flex flex-wrap gap-2">
                {live.map((p) => <PlatformChip key={p.id} name={p.name} color={p.color} />)}
                {soon.map((p) => <PlatformChip key={p.id} name={p.name} color={p.color} detail="soon" className="opacity-60" />)}
              </div>
            </div>

            {/* Product preview */}
            <div aria-hidden className="relative">
              <div className="rotate-1 rounded-3xl border border-border bg-card p-5 shadow-2xl shadow-accent/10">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span className="bg-brand grid size-6 place-items-center rounded-md text-xs text-white">✦</span>
                  AI Studio
                  <span className="ml-auto rounded-full bg-accent/15 px-2 py-0.5 text-xs text-accent">3 options</span>
                </div>
                <div className="mt-4 flex flex-col gap-3">
                  {[
                    ["Behind the scenes", "We tested 14 recipes so you don't have to. Here's the one that made the cut 👇", 92],
                    ["Quick tip", "Stop over-mixing your dough. 3 folds is all it takes. Save this for Sunday.", 86],
                    ["Story", "Two years ago I baked my first loaf in a borrowed oven. Today we open our doors.", 81],
                  ].map(([angle, text, score]) => (
                    <div key={String(angle)} className="rounded-xl border border-border bg-background p-3">
                      <div className="flex items-center text-xs">
                        <span className="font-semibold text-accent">{angle}</span>
                        <span className="ml-auto tabular-nums text-muted">{score}/100</span>
                      </div>
                      <p className="mt-1 text-sm">{text}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="absolute -bottom-6 -left-4 -rotate-3 rounded-2xl border border-border bg-card px-4 py-3 text-sm shadow-xl">
                <p className="font-semibold">✓ Published to 5 platforms</p>
                <p className="text-xs text-muted">X, LinkedIn, Threads, Facebook, Instagram</p>
              </div>
            </div>
          </div>
        </section>

        {/* Why us */}
        <section className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-3xl font-bold tracking-tight">We studied what frustrates creators about other tools</h2>
          <p className="mt-2 max-w-2xl text-muted">Then fixed it. Here&apos;s what creators told reviewers, and what we do instead.</p>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {pains.map((p) => (
              <div key={p.title} className="rounded-2xl border border-border bg-card p-5">
                <h3 className="font-semibold">{p.title}</h3>
                <p className="mt-3 flex gap-2 text-sm text-muted"><span aria-hidden className="text-red-500">✕</span>{p.them}</p>
                <p className="mt-2 flex gap-2 text-sm"><span aria-hidden className="text-green-600">✓</span>{p.us}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-6xl scroll-mt-8 px-4 py-16">
          <h2 className="text-3xl font-bold tracking-tight">Everything you need to show up every day</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="rounded-2xl border border-border bg-card p-5">
                <span aria-hidden className="grid size-10 place-items-center rounded-xl bg-accent/10 text-lg text-accent">{f.icon}</span>
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-muted">{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-3xl font-bold tracking-tight">Up and running in three steps</h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              ["Connect your accounts", "Sign in on each platform's own page. Your tokens are encrypted before they're stored."],
              ["Tell the AI your voice", "Describe your audience and topics once. Every draft, option and image follows it."],
              ["Approve and relax", "Autopilot fills your week. Approve with one click, and Monitor tells you what went out."],
            ].map(([t, d], i) => (
              <li key={t} className="rounded-2xl border border-border bg-card p-5">
                <span className="bg-brand grid size-8 place-items-center rounded-full text-sm font-bold text-white">{i + 1}</span>
                <h3 className="mt-4 font-semibold">{t}</h3>
                <p className="mt-1 text-sm text-muted">{d}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mx-auto max-w-6xl scroll-mt-8 px-4 py-16">
          <h2 className="text-3xl font-bold tracking-tight">Simple, flat pricing</h2>
          <p className="mt-2 max-w-2xl text-muted">
            Never per channel, never per post. Every plan is <strong className="text-foreground">free during the beta</strong>; we&apos;ll announce prices well before it ends.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {tiers.map((t) => (
              <div key={t.name} className={`flex flex-col rounded-2xl border bg-card p-6 ${t.highlight ? "border-accent shadow-xl shadow-accent/15" : "border-border"}`}>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold">{t.name}</h3>
                  {t.highlight && <span className="bg-brand rounded-full px-2 py-0.5 text-xs font-semibold text-white">Most popular</span>}
                </div>
                <p className="text-sm text-muted">{t.for}</p>
                <p className="mt-4 text-3xl font-bold">Free <span className="text-base font-normal text-muted">during beta</span></p>
                <ul className="mt-4 flex flex-1 flex-col gap-2 text-sm">
                  {t.items.map((i) => <li key={i} className="flex gap-2"><span aria-hidden className="text-accent">✓</span>{i}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto max-w-3xl scroll-mt-8 px-4 py-16">
          <h2 className="text-3xl font-bold tracking-tight">Questions</h2>
          <div className="mt-6 flex flex-col gap-3">
            {faqs.map((f) => (
              <details key={f.q} className="group rounded-2xl border border-border bg-card p-5">
                <summary className="cursor-pointer list-none font-semibold">
                  {f.q}
                  <span aria-hidden className="float-right text-muted transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-2 text-sm text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-20">
          <div className="bg-brand flex flex-col items-start gap-4 rounded-3xl p-8 text-white sm:p-12">
            <h2 className="text-3xl font-bold tracking-tight">Your next week of posts, done in ten minutes.</h2>
            <p className="max-w-xl text-white/85">Free while we&apos;re in beta. Bring every account you have.</p>
            <Show when="signed-out">
              <Link href="/sign-up" className="rounded-xl bg-white px-6 py-3 font-semibold text-violet-700">Start free</Link>
            </Show>
            <Show when="signed-in">
              <Link href="/dashboard" className="rounded-xl bg-white px-6 py-3 font-semibold text-violet-700">Open dashboard</Link>
            </Show>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-6 text-sm text-muted">
          <span>© {new Date().getFullYear()} Influencer Autopilot</span>
          <span className="ml-auto">Tokens encrypted with AES-256-GCM · Built for creators</span>
        </div>
      </footer>
    </div>
  );
}
