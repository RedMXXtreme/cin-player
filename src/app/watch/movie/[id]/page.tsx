// app/watch/movie/[id]/page.tsx
import VideoPlayer from "@/components/VideoPlayer";

export default async function MoviePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <VideoPlayer type="movie" id={id} />;
}