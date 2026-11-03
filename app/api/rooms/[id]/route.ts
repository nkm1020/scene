import { jsonError } from "@/server/db";
import { getRoomState } from "@/server/rooms";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return Response.json(await getRoomState(id));
  } catch (e) {
    return jsonError(e);
  }
}
