interface Env {
  ASSETS: Fetcher;
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const previewRoute = url.pathname === "/preview" || url.pathname === "/preview/";
    if (previewRoute) url.pathname = "/preview.html";

    const response = previewRoute && (request.method === "GET" || request.method === "HEAD")
      ? await env.ASSETS.fetch(url.toString(), { method: request.method, headers: request.headers })
      : await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set("X-Combat-Lab-Mode", "unsafe-local-only");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
} satisfies ExportedHandler<Env>;
