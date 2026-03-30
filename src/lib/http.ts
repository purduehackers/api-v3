import type { HttpResult } from "./types";

export function normalizePathname(url: string): string {
  const pathname = new URL(url).pathname;
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

export function toResponse(result: HttpResult): Response {
  const headers = new Headers(result.headers);

  if ("json" in result) {
    headers.set("content-type", "application/json; charset=UTF-8");
    return new Response(JSON.stringify(result.json), {
      status: result.status,
      headers,
    });
  }

  if ("text" in result) {
    headers.set("content-type", "text/plain; charset=UTF-8");
    return new Response(result.text, {
      status: result.status,
      headers,
    });
  }

  return new Response(null, {
    status: result.status,
    headers,
  });
}
