import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { Fetcher } from "../../src/render/assemble.ts";

export class TestSvgElement {
  readonly attributes = new Map<string, string>();
  readonly children: TestSvgElement[] = [];
  readonly classNames = new Set<string>();
  readonly dataset: Record<string, string> = {};
  readonly tagName: string;
  parentNode: TestSvgElement | null = null;

  readonly classList = {
    add: (...names: string[]): void => { for (const name of names) this.classNames.add(name); },
  };

  constructor(tagName: string) { this.tagName = tagName; }

  appendChild(child: TestSvgElement): TestSvgElement {
    child.remove();
    this.children.push(child);
    child.parentNode = this;
    return child;
  }

  replaceChildren(...children: TestSvgElement[]): void {
    for (const child of this.children) child.parentNode = null;
    this.children.length = 0;
    for (const child of children) this.appendChild(child);
  }

  remove(): void {
    if (!this.parentNode) return;
    const index = this.parentNode.children.indexOf(this);
    if (index >= 0) this.parentNode.children.splice(index, 1);
    this.parentNode = null;
  }

  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }
  removeAttribute(name: string): void { this.attributes.delete(name); }

  cloneNode(deep = false): TestSvgElement {
    const clone = new TestSvgElement(this.tagName);
    for (const [name, value] of this.attributes) clone.attributes.set(name, value);
    for (const [name, value] of Object.entries(this.dataset)) clone.dataset[name] = value;
    for (const name of this.classNames) clone.classNames.add(name);
    if (deep) for (const child of this.children) clone.appendChild(child.cloneNode(true));
    return clone;
  }
}

class TestParsedDocument {
  readonly documentElement = new TestSvgElement("svg");

  constructor() { this.documentElement.appendChild(new TestSvgElement("path")); }
  querySelector(): null { return null; }
}

class TestDomParser {
  parseFromString(): TestParsedDocument { return new TestParsedDocument(); }
}

export function installTestDom(): () => void {
  const previousDocument = globalThis.document;
  const previousParser = globalThis.DOMParser;
  const testDocument = {
    baseURI: "http://lab/",
    createElementNS: (_namespace: string, tagName: string) => new TestSvgElement(tagName),
    importNode: (node: TestSvgElement, deep: boolean) => node.cloneNode(deep),
  };
  globalThis.document = testDocument as unknown as Document;
  globalThis.DOMParser = TestDomParser as unknown as typeof DOMParser;
  return () => {
    if (previousDocument) globalThis.document = previousDocument;
    else Reflect.deleteProperty(globalThis, "document");
    if (previousParser) globalThis.DOMParser = previousParser;
    else Reflect.deleteProperty(globalThis, "DOMParser");
  };
}

export function repositoryFetcher(
  root: string,
  overrides: Readonly<Record<string, string>> = {},
): { readonly fetcher: Fetcher; readonly requests: string[] } {
  const requests: string[] = [];
  const fetcher: Fetcher = async (input) => {
    const pathname = new URL(String(input)).pathname.replace(/^\//, "");
    requests.push(pathname);
    const body = overrides[pathname] ?? readFileSync(resolve(root, pathname), "utf8");
    return new Response(body, { status: 200 });
  };
  return { fetcher, requests };
}
