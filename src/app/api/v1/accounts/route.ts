import { NextResponse } from "next/server";
import { withApiUser } from "@/lib/api/http";
import { listConnectedAccounts } from "@/lib/connected-accounts";

/** GET /api/v1/accounts: the caller's connected accounts (never tokens). */
export const GET = withApiUser(async (_req, userId) => {
  const accounts = await listConnectedAccounts(userId);
  return NextResponse.json({ data: accounts });
});
