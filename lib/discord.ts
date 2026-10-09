import { createPublicKey, verify } from "node:crypto";

const DISCORD_API = "https://discord.com/api/v10";
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/** Discord signs every interaction; reject anything that isn't from Discord. */
export function verifyDiscordRequest(body: string, signature: string | null, timestamp: string | null) {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey || !signature || !timestamp) return false;
  try {
    const key = createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKey, "hex")]), format: "der", type: "spki" });
    return verify(null, Buffer.from(timestamp + body), key, Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

export async function sendWebhook(payload: Record<string, unknown>) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) throw new Error("DISCORD_WEBHOOK_URL isn't set.");
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(`Discord webhook failed: HTTP ${res.status}`);
}

export async function editInteractionReply(token: string, payload: Record<string, unknown>) {
  await fetch(`${DISCORD_API}/webhooks/${process.env.DISCORD_APPLICATION_ID}/${token}/messages/@original`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/** Only Discord users listed in DISCORD_ALLOWED_USER_IDS can see revenue. */
export function isAllowedUser(userId: string | undefined) {
  const allowed = (process.env.DISCORD_ALLOWED_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return Boolean(userId) && allowed.includes(userId as string);
}
