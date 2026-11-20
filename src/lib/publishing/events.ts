import "server-only";
import { getDb } from "@/db";
import { activityEvents } from "@/db/schema";

export type EventInput = {
  userId: string;
  type: string;
  message: string;
  level?: "info" | "warning" | "error";
  postId?: string | null;
  postTargetId?: string | null;
  connectedAccountId?: string | null;
};

/** Monitoring log entry. Never throws: logging must not break publishing. */
export async function logEvent(e: EventInput) {
  try {
    await getDb().insert(activityEvents).values({ level: "info", ...e });
  } catch (err) {
    console.error("activity log write failed", err);
  }
}
