interface Env {
  ASSETS: Fetcher;
  SIDECAR_ORIGIN?: string;
}

function responseWithMode(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("X-SVGLab-Mode", "unsafe-local-only");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/dev/")) {
      if (!env.SIDECAR_ORIGIN) return new Response("dev sidecar is not running", { status: 404 });
      const target = new URL(`${url.pathname}${url.search}`, env.SIDECAR_ORIGIN);
      try {
        return responseWithMode(await fetch(new Request(target, request)));
      } catch {
        return new Response("dev sidecar is not running", { status: 404 });
      }
    }
    const preview = url.pathname === "/preview" || url.pathname === "/preview/";
    if (preview) url.pathname = "/preview.html";
    const response = preview && (request.method === "GET" || request.method === "HEAD")
      ? await env.ASSETS.fetch(url.toString(), { method: request.method, headers: request.headers })
      : await env.ASSETS.fetch(request);
    return responseWithMode(response);
  },
} satisfies ExportedHandler<Env>;
