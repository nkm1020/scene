// The demo cast (seed members) can never connect, so their presence is part of the story:
// Sam and Mina are at the table, Jay is asleep (the chat is about his surprise party).
export const CAST_ASLEEP = new Set(["Jay"]);
export const castHere = (m: { is_seed?: boolean | null; name: string }) => !!m.is_seed && !CAST_ASLEEP.has(m.name);
