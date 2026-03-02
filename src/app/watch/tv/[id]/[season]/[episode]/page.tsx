// app/watch/tv/[id]/[season]/[episode]/page.tsx
import VideoPlayer from "@/components/VideoPlayer";

export default async function TVPage({
  params,
}: {
  params: Promise<{ id: string; season: string; episode: string }>;
}) {
  const { id, season, episode } = await params;

  return (
    <VideoPlayer
      type="tv"
      id={id}
      season={Number(season)}
      episode={Number(episode)}
    />
  );
}