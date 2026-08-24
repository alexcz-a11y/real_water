import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReferenceControlModel } from "./reference-control-model.js";
import { createReferenceControlPresenters } from "./reference-control-presenters.js";

describe("Reference control presenter modes", () => {
  beforeEach(() => {
    vi.stubGlobal("document", new FakeDocument());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads Engineering once on demand and reuses the module", async () => {
    const mount = new FakeElement("main");
    const artistDisposals: Array<ReturnType<typeof vi.fn>> = [];
    let requestEngineering: (() => void) | undefined;
    const createArtist = vi.fn(
      (_mount: Element, _model: ReferenceControlModel, request: () => void) => {
        requestEngineering = request;
        const dispose = vi.fn();
        artistDisposals.push(dispose);
        return { dispose };
      },
    );
    const engineeringDisposal = vi.fn();
    let requestArtist: (() => void) | undefined;
    const createEngineering = vi.fn(
      (
        _mount: HTMLElement,
        _model: ReferenceControlModel,
        request: () => void,
      ) => {
        requestArtist = request;
        return { dispose: engineeringDisposal };
      },
    );
    const deferred = createDeferred<{
      createEngineeringControlPresenter: typeof createEngineering;
    }>();
    const loadEngineering = vi.fn(() => deferred.promise);
    const presenters = createReferenceControlPresenters(
      mount as unknown as Element,
      {} as ReferenceControlModel,
      {
        createArtistPresenter: createArtist,
        loadEngineeringPresenter: loadEngineering,
      },
    );

    expect(loadEngineering).not.toHaveBeenCalled();
    requestEngineering?.();
    requestEngineering?.();
    expect(loadEngineering).toHaveBeenCalledTimes(1);
    expect(artistDisposals[0]).not.toHaveBeenCalled();

    deferred.resolve({ createEngineeringControlPresenter: createEngineering });
    await deferred.promise;
    await Promise.resolve();

    expect(createEngineering).toHaveBeenCalledTimes(1);
    expect(artistDisposals[0]).toHaveBeenCalledTimes(1);
    expect(rootOf(mount).dataset.mode).toBe("engineering");

    requestArtist?.();
    expect(engineeringDisposal).toHaveBeenCalledTimes(1);
    expect(createArtist).toHaveBeenCalledTimes(2);
    expect(rootOf(mount).dataset.mode).toBe("artist");

    presenters.dispose();
    presenters.dispose();
    expect(artistDisposals[1]).toHaveBeenCalledTimes(1);
    expect(mount.children).toHaveLength(0);
  });

  it("keeps Artist available when the lazy module fails", async () => {
    const mount = new FakeElement("main");
    const artistDisposal = vi.fn();
    let requestEngineering: (() => void) | undefined;
    const loadEngineering = vi.fn(() =>
      Promise.reject(new Error("Synthetic lazy import failure.")),
    );
    const presenters = createReferenceControlPresenters(
      mount as unknown as Element,
      {} as ReferenceControlModel,
      {
        createArtistPresenter: (_mount, _model, request) => {
          requestEngineering = request;
          return { dispose: artistDisposal };
        },
        loadEngineeringPresenter: loadEngineering,
      },
    );

    requestEngineering?.();
    await Promise.resolve();
    await Promise.resolve();

    const root = rootOf(mount);
    expect(root.dataset.mode).toBe("artist");
    expect(root.children[1]?.textContent).toContain(
      "Artist controls remain available",
    );
    expect(artistDisposal).not.toHaveBeenCalled();

    presenters.dispose();
  });
});

function rootOf(mount: FakeElement): FakeElement {
  const root = mount.children[0];
  if (root === undefined) {
    throw new Error("The presenter root was not mounted.");
  }
  return root;
}

function createDeferred<Value>(): {
  readonly promise: Promise<Value>;
  resolve(value: Value): void;
} {
  let resolve: (value: Value) => void = () => {};
  const promise = new Promise<Value>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

class FakeDocument {
  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName);
  }
}

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  className = "";
  parent: FakeElement | null = null;
  textContent = "";

  public constructor(readonly tagName: string) {}

  append(...children: FakeElement[]): void {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
    }
  }

  replaceChildren(...children: FakeElement[]): void {
    for (const child of this.children) {
      child.parent = null;
    }
    this.children.length = 0;
    this.append(...children);
  }

  setAttribute(): void {}

  remove(): void {
    if (this.parent === null) {
      return;
    }
    const index = this.parent.children.indexOf(this);
    if (index >= 0) {
      this.parent.children.splice(index, 1);
    }
    this.parent = null;
  }
}
