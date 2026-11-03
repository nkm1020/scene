import RoomApp from "@/client/RoomApp";

export default async function Room({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RoomApp roomId={id} />;
}
