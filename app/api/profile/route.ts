import { jsonError } from "@/server/db";
import { createProfile } from "@/server/profiles";
export const runtime = "nodejs";

// Start a profile: a name and a preset voice. No account and no email: the key stays in this browser.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { profile, secret } = await createProfile(body.name, body.preset);
    return Response.json({ profileId: profile.id, secret, profile });
  } catch (e) {
    return jsonError(e);
  }
}
