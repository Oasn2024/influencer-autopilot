import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Dashboard and app API routes need a signed-in user. The developer API (/api/v1)
// authenticates API keys itself, and the cron route checks CRON_SECRET.
const isProtectedRoute = createRouteMatcher(["/dashboard(.*)", "/api(.*)"]);
const isSelfAuthenticated = createRouteMatcher(["/api/v1(.*)", "/api/cron(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req) && !isSelfAuthenticated(req)) await auth.protect();
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
