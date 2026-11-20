"use client";

import { useState, useTransition } from "react";
import { buttonClass, inputClass, primaryButtonClass } from "@/components/ui";
import { createApiKeyAction } from "../actions";

export function NewKey() {
  const [name, setName] = useState("");
  const [key, setKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input className={inputClass} placeholder="Key name, e.g. Zapier" value={name} onChange={(e) => setName(e.target.value)} />
        <button
          type="button"
          className={primaryButtonClass}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await createApiKeyAction(name);
              if (res.ok) {
                setKey(res.data!.key);
                setCopied(false);
                setName("");
              }
            })
          }
        >
          Create key
        </button>
      </div>
      {key && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <p className="mb-2 font-medium">Copy this key now. It won&apos;t be shown again.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <code className="break-all rounded bg-background p-2 text-xs">{key}</code>
            <button
              type="button"
              className={buttonClass}
              onClick={async () => {
                await navigator.clipboard.writeText(key);
                setCopied(true);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
