import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");

  if (!url) {
    return new Response("Missing url parameter", { status: 400 });
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });

    const contentType = response.headers.get("content-type") || "";

    const body = await response.text();

    // If it's an m3u8 file, rewrite segment URLs
    if (contentType.includes("application/vnd.apple.mpegurl") || url.endsWith(".m3u8")) {
      const rewritten = body.replace(
        /(https?:\/\/[^\s]+)/g,
        (match) =>
          `${req.nextUrl.origin}/api/m3u8-proxy?url=${encodeURIComponent(match)}`
      );

      return new Response(rewritten, {
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
        },
      });
    }

    // If it's a segment (.ts)
    return new Response(body, {
      headers: {
        "Content-Type": contentType,
      },
    });
  } catch (err) {
    return new Response("Proxy error", { status: 500 });
  }
}
