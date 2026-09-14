import type { Clip } from "boneyard";

export interface RuntimeCatalog {
  readonly contract: 1;
  readonly clips: Readonly<Record<string, Clip>>;
  readonly origins: Readonly<Record<string, string | null>>;
  readonly lanes: Readonly<Record<string, "shipped" | "authored" | "study">>;
  readonly revision?: number;
}

function validateCatalog(value: unknown): RuntimeCatalog {
  const catalog = value as Partial<RuntimeCatalog> | null;
  if (!catalog || catalog.contract !== 1 || typeof catalog.clips !== "object" || catalog.clips === null) {
    throw new Error("clip catalog has an unsupported shape");
  }
  return catalog as RuntimeCatalog;
}

export async function fetchRuntimeCatalog(): Promise<RuntimeCatalog> {
  const development = await fetch("/dev/catalog");
  const response = development.ok ? development : await fetch("/catalog/clips.json");
  if (!response.ok) throw new Error(`clip catalog is unavailable (${response.status})`);
  return validateCatalog(await response.json());
}

/** Live updates are optional: a production build has no sidecar and remains fully usable. */
export function watchRuntimeCatalog(
  onCatalog: (catalog: RuntimeCatalog) => void,
  onError: (message: string) => void,
): EventSource {
  const events = new EventSource("/dev/events");
  events.addEventListener("catalog", () => {
    void fetchRuntimeCatalog().then(onCatalog, (error: unknown) => onError((error as Error).message));
  });
  events.addEventListener("error", (event) => {
    if (event instanceof MessageEvent) onError(JSON.parse(event.data) as string);
  });
  return events;
}
