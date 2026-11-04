import "server-only";
import { randomBytes } from "node:crypto";
import { db, hashSecret, newSecret, newRoomId, authMember, HttpError } from "./db";
import { forkDemoRoom } from "./rooms";

// A profile is one person across rooms: their member row in a private home room. Name, figure and voice are made
// once, on the profile; every seat they take in a room links back to it and carries the same figure, voice and secret.

const PRESETS = ["female_a", "female_b", "male", "male_b"];
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L

const newCode = () => "SCN-" + [...randomBytes(4)].map((b) => CODE_CHARS[b % CODE_CHARS.length]).join("");

const SEAT_FIELDS = "name, persona_url, persona_away_url, figure, figure_status, persona_spec, enrolled_voice, preset";

export async function createProfile(nameIn: unknown, presetIn: unknown) {
  const name = String(nameIn ?? "").trim().slice(0, 24);
  if (!name) throw new HttpError(400, "name is required");
  const preset = PRESETS.includes(String(presetIn)) ? String(presetIn) : "female_a";
  const homeId = `home-${newRoomId()}`;
  await db().from("rooms").insert({ id: homeId, name: `${name}'s place`, kind: "home" }).throwOnError();
  let member: any = null;
  for (let i = 0; i < 4 && !member; i++) {
    const { data, error } = await db().from("members").insert({ room_id: homeId, name, preset, friend_code: newCode() }).select("*").single();
    if (!error) member = data;
    else if (!String(error.message).includes("friend_code")) throw error;
  }
  if (!member) throw new HttpError(500, "could not make a friend code");
  const secret = newSecret();
  await db().from("member_secrets").insert({ member_id: member.id, secret_hash: hashSecret(secret) }).throwOnError();
  return { profile: member, secret };
}

/** A profile's credentials: a member row that owns a friend code (only home members do). */
export async function authProfile(profileId: unknown, secret: unknown) {
  const { member, secrets } = await authMember(String(profileId ?? ""), String(secret ?? ""));
  if (!member.friend_code) throw new HttpError(403, "not a profile");
  return { profile: member, secrets };
}

/** Take a seat in a room as this profile (or return the seat already taken). The seat shares the profile's secret. */
export async function seatProfile(roomId: string, profileId: string) {
  const { data: existing } = await db().from("members").select("*").eq("room_id", roomId).eq("profile_id", profileId).maybeSingle();
  if (existing) return existing;
  const [{ data: room }, { data: p }, { data: s }, { count }] = await Promise.all([
    db().from("rooms").select("id, kind").eq("id", roomId).maybeSingle(),
    db().from("members").select(SEAT_FIELDS).eq("id", profileId).single(),
    db().from("member_secrets").select("secret_hash, voice_path, voice_text").eq("member_id", profileId).single(),
    db().from("members").select("id", { count: "exact", head: true }).eq("room_id", roomId),
  ]);
  if (!room || room.kind === "home") throw new HttpError(404, "room not found");
  if ((count ?? 0) >= 6) throw new HttpError(409, "this room is full (max 6)");
  const { data: seat, error } = await db()
    .from("members")
    .insert({ ...p, room_id: roomId, profile_id: profileId })
    .select("*")
    .single();
  if (error) throw error;
  await db().from("member_secrets").insert({ member_id: seat.id, ...s }).throwOnError();
  return seat;
}

/** After the profile's figure or name changes: copy it onto every seat. (Poses already merge into seats in SQL.) */
export async function syncSeats(profileId: string, patch: Record<string, unknown>) {
  await db().from("members").update(patch).eq("profile_id", profileId);
}

/** After the profile's voice changes: every seat speaks with the same reference (or the preset again). */
export async function syncVoice(profileId: string) {
  const [{ data: s }, { data: p }] = await Promise.all([
    db().from("member_secrets").select("voice_path, voice_text").eq("member_id", profileId).single(),
    db().from("members").select("enrolled_voice").eq("id", profileId).single(),
  ]);
  const { data: seats } = await db().from("members").select("id").eq("profile_id", profileId);
  const ids = (seats ?? []).map((x) => x.id);
  if (!ids.length) return;
  await Promise.all([
    db().from("member_secrets").update({ voice_path: s?.voice_path ?? null, voice_text: s?.voice_text ?? null }).in("member_id", ids),
    db().from("members").update({ enrolled_voice: !!p?.enrolled_voice }).in("id", ids),
  ]);
}

// ───────── the chat list ─────────

export async function myRooms(profileId: string, seen: Record<string, number>) {
  const { data: seats } = await db().from("members").select("id, room_id").eq("profile_id", profileId);
  const seatOf = new Map((seats ?? []).map((s) => [s.room_id, s.id]));
  const ids = [...seatOf.keys()];
  if (!ids.length) return [];
  const [{ data: rooms }, { data: members }] = await Promise.all([
    db().from("rooms").select("id, name, kind, set, created_at").in("id", ids),
    db().from("members").select("id, room_id, name, persona_url, profile_id, is_seed").in("room_id", ids).order("created_at"),
  ]);
  const out = await Promise.all(
    (rooms ?? []).map(async (r) => {
      const after = Number(seen[r.id] ?? 0);
      const [{ data: last }, { count }] = await Promise.all([
        db().from("messages").select("member_id, text, seq, created_at").eq("room_id", r.id).order("seq", { ascending: false }).limit(1).maybeSingle(),
        db().from("messages").select("id", { count: "exact", head: true }).eq("room_id", r.id).gt("seq", after).neq("member_id", seatOf.get(r.id)!),
      ]);
      const people = (members ?? []).filter((m) => m.room_id === r.id);
      return {
        id: r.id,
        name: r.name,
        kind: r.kind,
        seatId: seatOf.get(r.id)!,
        people: people.map((m) => ({ id: m.id, name: m.name, face: m.persona_url, me: m.profile_id === profileId, ai: m.is_seed })),
        last: last ? { who: people.find((m) => m.id === last.member_id)?.name ?? "", text: last.text, at: last.created_at, mine: last.member_id === seatOf.get(r.id) } : null,
        unread: count ?? 0,
        at: last?.created_at ?? r.created_at,
      };
    }),
  );
  return out.sort((a, b) => (a.at < b.at ? 1 : -1));
}

/** Every profile gets its own copy of the demo room (a scripted chat), seated, the first time it opens Scene. */
export async function ensureDemoRoom(profileId: string) {
  const demoSeats = async () =>
    (await db().from("members").select("room_id, created_at, rooms!inner(kind)").eq("profile_id", profileId).eq("rooms.kind", "demo").order("created_at")).data ?? [];
  let all = await demoSeats();
  if (!all.length) {
    const roomId = await forkDemoRoom();
    await db().from("rooms").update({ kind: "demo" }).eq("id", roomId);
    await seatProfile(roomId, profileId);
    all = await demoSeats();
  }
  // two first visits at once (two tabs) can fork twice: keep the older copy
  for (const r of all.slice(1)) await db().from("rooms").delete().eq("id", r.room_id);
  return all[0]?.room_id as string;
}

// ───────── friends: request, then accept ─────────

const PUBLIC = "id, name, persona_url, friend_code";

export async function listFriends(profileId: string) {
  const { data: rows } = await db().from("friendships").select("*").or(`from_profile.eq.${profileId},to_profile.eq.${profileId}`).neq("status", "declined");
  const otherIds = [...new Set((rows ?? []).map((r) => (r.from_profile === profileId ? r.to_profile : r.from_profile)))];
  const { data: people } = otherIds.length ? await db().from("members").select(PUBLIC).in("id", otherIds) : { data: [] as any[] };
  const byId = new Map((people ?? []).map((p) => [p.id, p]));
  const view = (r: any) => {
    const other = byId.get(r.from_profile === profileId ? r.to_profile : r.from_profile);
    return { id: r.id, roomId: r.room_id, at: r.created_at, person: other ? { id: other.id, name: other.name, face: other.persona_url, code: other.friend_code } : null };
  };
  const all = rows ?? [];
  return {
    friends: all.filter((r) => r.status === "accepted").map(view),
    incoming: all.filter((r) => r.status === "pending" && r.to_profile === profileId).map(view),
    outgoing: all.filter((r) => r.status === "pending" && r.from_profile === profileId).map(view),
  };
}

export async function requestFriend(profileId: string, codeIn: unknown) {
  const code = String(codeIn ?? "").trim().toUpperCase().replace(/^SCN-?/, "");
  if (!/^[A-Z0-9]{4}$/.test(code)) throw new HttpError(400, "a friend code looks like SCN-4F2K");
  const { data: other } = await db().from("members").select(PUBLIC).eq("friend_code", `SCN-${code}`).maybeSingle();
  if (!other) throw new HttpError(404, "no one has that code");
  if (other.id === profileId) throw new HttpError(400, "that is your own code");
  const { data: rows } = await db().from("friendships").select("*").or(`and(from_profile.eq.${profileId},to_profile.eq.${other.id}),and(from_profile.eq.${other.id},to_profile.eq.${profileId})`);
  const mine = (rows ?? []).find((r) => r.from_profile === profileId);
  const theirs = (rows ?? []).find((r) => r.from_profile === other.id);
  if (mine?.status === "accepted" || theirs?.status === "accepted") return { status: "friends", name: other.name };
  // they already asked me: asking back is a yes
  if (theirs?.status === "pending") {
    await answerFriend(profileId, theirs.id, true);
    return { status: "friends", name: other.name };
  }
  if (mine) await db().from("friendships").update({ status: "pending", created_at: new Date().toISOString() }).eq("id", mine.id).throwOnError();
  else await db().from("friendships").insert({ from_profile: profileId, to_profile: other.id }).throwOnError();
  return { status: "requested", name: other.name };
}

export async function answerFriend(profileId: string, requestId: string, accept: boolean) {
  const { data: r } = await db().from("friendships").select("*").eq("id", requestId).maybeSingle();
  if (!r || r.to_profile !== profileId || r.status !== "pending") throw new HttpError(404, "no such request");
  if (!accept) {
    await db().from("friendships").update({ status: "declined" }).eq("id", r.id).throwOnError();
    return { roomId: null };
  }
  const { data: two } = await db().from("members").select("id, name").in("id", [r.from_profile, r.to_profile]);
  const names = (two ?? []).map((p) => p.name);
  const roomId = newRoomId();
  await db().from("rooms").insert({ id: roomId, name: names.join(" & ").slice(0, 40), kind: "dm" }).throwOnError();
  await seatProfile(roomId, r.from_profile);
  await seatProfile(roomId, r.to_profile);
  await db().from("friendships").update({ status: "accepted", room_id: roomId }).eq("id", r.id).throwOnError();
  return { roomId };
}

async function assertFriends(profileId: string, otherId: string) {
  const { data } = await db()
    .from("friendships")
    .select("id")
    .eq("status", "accepted")
    .or(`and(from_profile.eq.${profileId},to_profile.eq.${otherId}),and(from_profile.eq.${otherId},to_profile.eq.${profileId})`)
    .limit(1);
  if (!data?.length) throw new HttpError(403, "you can only seat your friends");
}

/** A new group chat with some of your friends. */
export async function createGroup(profileId: string, nameIn: unknown, friendIds: unknown) {
  const ids = Array.isArray(friendIds) ? friendIds.map(String).slice(0, 5) : [];
  for (const id of ids) await assertFriends(profileId, id);
  const roomId = newRoomId();
  await db().from("rooms").insert({ id: roomId, name: String(nameIn ?? "").trim().slice(0, 40) || "Our table", kind: "group" }).throwOnError();
  await seatProfile(roomId, profileId);
  for (const id of ids) await seatProfile(roomId, id);
  return roomId;
}

/** Seat a friend at a room you are in. */
export async function seatFriend(roomId: string, profileId: string, friendId: string) {
  const { data: mine } = await db().from("members").select("id").eq("room_id", roomId).eq("profile_id", profileId).maybeSingle();
  if (!mine) throw new HttpError(403, "you are not in this room");
  await assertFriends(profileId, friendId);
  return seatProfile(roomId, friendId);
}
