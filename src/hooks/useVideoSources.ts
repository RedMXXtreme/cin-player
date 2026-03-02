"use client";

import { useState, useEffect } from "react";
import { getTVSources, getMovieSources, MapperResponse } from "@/lib/mapper";

interface TVOptions {
  type: "tv";
  id: string;
  season: number;
  episode: number;
}

interface MovieOptions {
  type: "movie";
  id: string;
}

type Options = TVOptions | MovieOptions;

export function useVideoSources(options: Options) {
  const [data, setData] = useState<MapperResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const fetch =
      options.type === "tv"
        ? getTVSources(options.id, options.season, options.episode)
        : getMovieSources(options.id);

    fetch
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [options.type, options.id, ...(options.type === "tv" ? [options.season, options.episode] : [])]);

  return { data, loading, error };
}
