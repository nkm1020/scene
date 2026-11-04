import RoomApp from "@/client/RoomApp";

export default async function Room({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ door?: string }> }) {
  const { id } = await params;
  const { door } = await searchParams;
  return <RoomApp roomId={id} door={door === "1"} />;
}
