"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DisconnectButton({ accountId }: { accountId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      className="rounded-md border border-border px-3 py-1 text-sm disabled:opacity-50"
      onClick={async () => {
        setBusy(true);
        const res = await fetch(`/api/accounts/${accountId}`, { method: "DELETE" });
        setBusy(false);
        if (res.ok) router.refresh();
      }}
    >
      {busy ? "Removing…" : "Disconnect"}
    </button>
  );
}
