interface Env {
  ASSETS: Fetcher;
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    let assetRequest = request;

    if ((url.pathname === "/preview" || url.pathname === "/preview/") && (request.method === "GET" || request.method === "HEAD")) {
      url.pathname = "/preview.html";
      assetRequest = new Request(url.toString(), {
        method: request.method,
        headers: request.headers,
      });
    }

    const response = await env.ASSETS.fetch(assetRequest);
    const headers = new Headers(response.headers);
    headers.set("X-Combat-Lab-Mode", "unsafe-local-only");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
} satisfies ExportedHandler<Env>;
