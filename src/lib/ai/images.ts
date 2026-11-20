import "server-only";
import { randomUUID } from "node:crypto";
import { generateImage } from "ai";
import { put } from "@vercel/blob";
import { resolveImageModel, type Aspect } from "./models";

/** Image generation needs somewhere public to keep the file, because platforms fetch media by URL. */
export const imagesEnabled = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

export async function generatePostImage(userId: string, input: { prompt: string; aspect?: Aspect; model?: string | null }) {
  if (!imagesEnabled()) throw new Error("Image storage isn't set up yet");
  const model = resolveImageModel(input.model);
  const { image } = await generateImage({
    model,
    prompt: `${input.prompt.slice(0, 1000)}\n\nSocial media image. No watermarks. Avoid text unless asked.`,
    aspectRatio: (input.aspect ?? "1:1") as `${number}:${number}`,
  });
  const type = image.mediaType || "image/png";
  const ext = type.split("/")[1]?.replace("jpeg", "jpg") || "png";
  const blob = await put(`ai-images/${userId}/${randomUUID()}.${ext}`, Buffer.from(image.uint8Array), {
    access: "public",
    contentType: type,
  });
  return { url: blob.url, model };
}
