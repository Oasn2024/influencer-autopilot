import { PublishError, requestJson, withMediaLinks, type Publisher } from "./types";

const version = () => process.env.LINKEDIN_API_VERSION ?? "202510";

export const linkedinPublisher: Publisher = {
  platform: "linkedin",
  async publish(target, accessToken, content) {
    const author = `urn:li:person:${target.externalAccountId}`;
    // Image/video posts need LinkedIn's asset upload flow; media links are included in the text for now.
    const { headers } = await requestJson("https://api.linkedin.com/rest/posts", {
      platformName: "LinkedIn",
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "LinkedIn-Version": version(),
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        author,
        commentary: withMediaLinks(content.text, content.mediaUrls),
        visibility: "PUBLIC",
        distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      }),
    });
    const urn = headers.get("x-restli-id");
    if (!urn) throw new PublishError("LinkedIn did not return a post id");
    return { externalPostId: urn, url: `https://www.linkedin.com/feed/update/${urn}` };
  },
  async refresh({ refreshToken }) {
    if (!refreshToken) throw new PublishError("LinkedIn session expired; reconnect the account", { auth: true });
    const { data } = await requestJson<{ access_token: string; refresh_token?: string; expires_in?: number }>(
      "https://www.linkedin.com/oauth/v2/accessToken",
      {
        platformName: "LinkedIn",
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: process.env.LINKEDIN_CLIENT_ID ?? "",
          client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? "",
        }),
      },
    );
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
    };
  },
};
