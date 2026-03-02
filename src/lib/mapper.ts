const M3U8_PROXY = "https://cin-m3u8-proxy-production.up.railway.app/m3u8-proxy?url=";
const MAPPER_BASE = "https://zero-mapper.vercel.app";

export type ServerName = "megacloud" | "upcloud";

export interface Subtitle {
  file: string;
  label: string;
  kind: string;
  default?: boolean;
}

export interface VideoSource {
  server: ServerName;
  url: string;
  proxiedUrl: string;
  isM3U8: boolean;
  quality: string;
  subtitles: Subtitle[];
}

export interface MapperResponse {
  sources: VideoSource[];
  title: string;
  episodeName?: string;
  description?: string;
  image?: string;
}

const TARGET_SERVERS: ServerName[] = ["megacloud", "upcloud"];

async function fetchMapper(endpoint: string): Promise<MapperResponse> {
  const res = await fetch(`${MAPPER_BASE}${endpoint}`, {
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    throw new Error(`Mapper API error: ${res.status}`);
  }

  const data = await res.json();

  // Filter only megacloud and upcloud
  const allSources: any[] = data.sources ?? [];
  const filtered = allSources.filter((s: any) =>
    TARGET_SERVERS.includes(s.server as ServerName)
  );

  const sources: VideoSource[] = filtered.map((s: any) => ({
    server: s.server as ServerName,
    url: s.url,
    proxiedUrl: s.isM3U8 ? `${M3U8_PROXY}${encodeURIComponent(s.url)}` : s.url,
    isM3U8: s.isM3U8,
    quality: s.quality ?? "auto",
    subtitles: s.subtitles ?? [],
  }));

  return {
    sources,
    title: data.title ?? data.tmdbTitle ?? "",
    episodeName: data.episodeName,
    description: data.description,
    image: data.image ?? data.tmdbPosterUrl,
  };
}

export async function getTVSources(
  id: string,
  season: number,
  episode: number
): Promise<MapperResponse> {
  return fetchMapper(`/tv/${id}/${season}/${episode}`);
}

export async function getMovieSources(id: string): Promise<MapperResponse> {
  return fetchMapper(`/movie/${id}`);
}