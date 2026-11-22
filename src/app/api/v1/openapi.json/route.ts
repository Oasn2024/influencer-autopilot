import { NextResponse } from "next/server";
import { openApiSpec } from "@/lib/api/openapi";
import { appOrigin } from "@/lib/oauth/flow";

/** Public: the API description itself holds no user data. */
export function GET(req: Request) {
  return NextResponse.json(openApiSpec(appOrigin(req)), { headers: { "Cache-Control": "public, max-age=3600" } });
}
