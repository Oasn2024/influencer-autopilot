import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteConnectedAccount } from "@/lib/connected-accounts";
import { requireUserId } from "@/lib/users";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const removed = await deleteConnectedAccount(userId, id);
  return removed ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
