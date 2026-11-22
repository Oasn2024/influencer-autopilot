/** OpenAPI 3.1 description of the developer API, for tools that import one (ChatGPT GPT Actions, n8n, Make, Postman). */
export function openApiSpec(serverUrl: string) {
  const id = { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } };
  const ok = (description: string) => ({ description, content: { "application/json": { schema: { type: "object" } } } });
  return {
    openapi: "3.1.0",
    info: {
      title: "Influencer Autopilot API",
      version: "1.0.0",
      description:
        "Schedule and track social posts for a creator. Start with GET /api/v1/autopilot to see open posting times, accounts, brand voice and topics, then create posts for those times.",
    },
    servers: [{ url: serverUrl }],
    security: [{ apiKey: [] }],
    components: {
      securitySchemes: { apiKey: { type: "http", scheme: "bearer", description: "An iap_ API key from the AI agents page" } },
      schemas: {
        NewPost: {
          type: "object",
          required: ["account_ids"],
          properties: {
            body: { type: "string", description: "Post text" },
            account_ids: { type: "array", items: { type: "string", format: "uuid" }, description: "From GET /api/v1/accounts" },
            media_urls: { type: "array", items: { type: "string", format: "uri" }, description: "Public image or video URLs (Instagram needs one)" },
            overrides: { type: "object", additionalProperties: { type: "string" }, description: "Different text per account id" },
            scheduled_at: { type: "string", format: "date-time", description: "When to post. Omit to post on the next run" },
            draft: { type: "boolean", description: "Save without scheduling" },
            require_approval: { type: "boolean", description: "Wait for the creator to approve it in the app" },
          },
        },
      },
    },
    paths: {
      "/api/v1/autopilot": { get: { operationId: "getAutopilotBrief", summary: "Open posting times, accounts, brand voice and topics", responses: { 200: ok("Brief") } } },
      "/api/v1/accounts": { get: { operationId: "listAccounts", summary: "Connected social accounts", responses: { 200: ok("Accounts") } } },
      "/api/v1/posts": {
        get: {
          operationId: "listPosts",
          summary: "List posts",
          parameters: [
            { name: "status", in: "query", schema: { type: "string" }, description: "Comma-separated, e.g. scheduled,pending_approval" },
            { name: "limit", in: "query", schema: { type: "integer", maximum: 200 } },
          ],
          responses: { 200: ok("Posts") },
        },
        post: {
          operationId: "createPost",
          summary: "Create a post",
          requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/NewPost" } } } },
          responses: { 201: ok("Created post"), 422: ok("Post can't be published as written") },
        },
      },
      "/api/v1/posts/{id}": {
        get: { operationId: "getPost", summary: "One post and its result on each account", parameters: [id], responses: { 200: ok("Post") } },
        delete: { operationId: "cancelPost", summary: "Cancel a post that hasn't gone out", parameters: [id], responses: { 200: ok("Canceled") } },
      },
      "/api/v1/posts/{id}/approve": {
        post: {
          operationId: "approvePost",
          summary: "Approve a draft or pending post",
          parameters: [id],
          requestBody: { content: { "application/json": { schema: { type: "object", properties: { scheduled_at: { type: "string", format: "date-time" } } } } } },
          responses: { 200: ok("Scheduled post") },
        },
      },
      "/api/v1/posts/{id}/publish": { post: { operationId: "publishPostNow", summary: "Publish now", parameters: [id], responses: { 200: ok("Post") } } },
      "/api/v1/drafts": {
        post: {
          operationId: "writeDrafts",
          summary: "Optional: post ideas from the app's own AI writer",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["topic", "platforms"],
                  properties: { topic: { type: "string" }, platforms: { type: "array", items: { type: "string" } }, count: { type: "integer", maximum: 3 } },
                },
              },
            },
          },
          responses: { 200: ok("Draft options") },
        },
      },
    },
  };
}
