import Link from "next/link";
import { Show } from "@clerk/nextjs";
import { PLATFORMS } from "@/lib/platforms";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-16 sm:py-24">
      <section className="flex flex-col gap-4">
        <p className="text-sm font-medium uppercase tracking-wide text-accent">Influencer Autopilot</p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Write once. Post everywhere.</h1>
        <p className="text-lg text-muted">
          Connect your social accounts, draft content with AI, and schedule it to every platform from one place.
          Your account credentials are encrypted before they are stored.
        </p>
        <div className="flex gap-3">
          <Show when="signed-out">
            <Link href="/sign-up" className="rounded-lg bg-accent px-5 py-2.5 font-medium text-white">Get started</Link>
            <Link href="/sign-in" className="rounded-lg border border-border px-5 py-2.5 font-medium">Sign in</Link>
          </Show>
          <Show when="signed-in">
            <Link href="/dashboard" className="rounded-lg bg-accent px-5 py-2.5 font-medium text-white">Open dashboard</Link>
          </Show>
        </div>
      </section>
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted">Platforms</h2>
        <ul className="flex flex-wrap gap-2">
          {Object.values(PLATFORMS).map((p) => (
            <li key={p.id} className="rounded-full border border-border px-3 py-1 text-sm">{p.name}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
