import { NextResponse } from "next/server";
import { listConnectedAccounts } from "@/lib/connected-accounts";
import { requireUserId } from "@/lib/users";

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ accounts: await listConnectedAccounts(userId) });
}
