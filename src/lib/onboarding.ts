/** First-run steps shown on the dashboard until a creator has finished them all. */
export type SetupState = { accounts: number; brandVoice: string; posts: number; slots: number; autopilotOn: boolean };
export type SetupStep = { id: string; title: string; detail: string; href: string; cta: string; done: boolean };

export function setupSteps(s: SetupState): SetupStep[] {
  return [
    { id: "connect", title: "Connect a social account", detail: "Sign in on the platform's own page. We only keep an encrypted token.", href: "/dashboard/accounts", cta: "Connect", done: s.accounts > 0 },
    { id: "voice", title: "Describe your voice", detail: "A sentence or two about you and your audience makes every AI draft sound like you.", href: "/dashboard/autopilot", cta: "Add voice", done: s.brandVoice.trim().length >= 10 },
    { id: "post", title: "Create your first post with AI", detail: "Pick a topic, get three options, keep your favourite.", href: "/dashboard/compose", cta: "Create", done: s.posts > 0 },
    { id: "times", title: "Pick your weekly posting times", detail: "One click uses the best times for your platforms.", href: "/dashboard/autopilot", cta: "Set times", done: s.slots > 0 },
    { id: "autopilot", title: "Turn on autopilot", detail: "AI keeps your week filled with drafts. You approve before anything posts.", href: "/dashboard/autopilot", cta: "Turn on", done: s.autopilotOn },
  ];
}
