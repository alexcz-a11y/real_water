import { describe, expect, it, vi } from "vitest";
import { RenderTarget, type Renderer } from "three/webgpu";
import {
  createPostTraaComposition,
  type PostTraaCompositionPlan,
  type PostTraaStageFactory,
  type PreparedPostTraaStage,
} from "../src/post-traa-composition.js";

const drawingBuffer = Object.freeze({ width: 320, height: 180 });
const renderer = {} as Renderer;

function plan(
  ids: readonly string[] = ["first-stage", "second-stage"],
): PostTraaCompositionPlan {
  let predecessor = "traa";
  return {
    mode: "ordered-declarative-stages",
    resolutionPolicy: "drawing-buffer-exact",
    stages: ids.map((id) => {
      const stage = { id, after: predecessor };
      predecessor = id;
      return stage;
    }),
  };
}

function factory(
  id: string,
  output: RenderTarget,
  overrides: Partial<Omit<PreparedPostTraaStage, "id" | "output">> = {},
): PostTraaStageFactory {
  return {
    id,
    create: () => ({
      id,
      output,
      prepare: async () => {},
      render() {},
      probe: async () => {},
      dispose() {
        output.dispose();
      },
      ...overrides,
    }),
  };
}

describe("post-TRAA composition", () => {
  it("constructs the declared order with linear input chaining and a stable output", () => {
    const source = new RenderTarget(320, 180);
    const firstOutput = new RenderTarget(320, 180);
    const secondOutput = new RenderTarget(320, 180);
    const inputs: RenderTarget[] = [];
    const receivedDrawingBuffers: Readonly<{
      width: number;
      height: number;
    }>[] = [];
    const factories: PostTraaStageFactory[] = [
      {
        id: "second-stage",
        create: ({ input, drawingBuffer: size }) => {
          inputs.push(input);
          receivedDrawingBuffers.push(size);
          return factory("second-stage", secondOutput).create({
            renderer,
            input,
            drawingBuffer: size,
          });
        },
      },
      {
        id: "first-stage",
        create: ({ input, drawingBuffer: size }) => {
          inputs.push(input);
          receivedDrawingBuffers.push(size);
          return factory("first-stage", firstOutput).create({
            renderer,
            input,
            drawingBuffer: size,
          });
        },
      },
    ];

    const composition = createPostTraaComposition({
      renderer,
      source,
      drawingBuffer,
      plan: plan(),
      factories,
    });

    expect(inputs).toEqual([source, firstOutput]);
    expect(receivedDrawingBuffers).toEqual([drawingBuffer, drawingBuffer]);
    expect(receivedDrawingBuffers[0]).toBe(receivedDrawingBuffers[1]);
    expect(Object.isFrozen(receivedDrawingBuffers[0])).toBe(true);
    expect(composition.stageIds).toEqual(["first-stage", "second-stage"]);
    expect(Object.isFrozen(composition.stageIds)).toBe(true);
    expect(Object.isFrozen(composition)).toBe(true);
    expect(composition.output).toBe(secondOutput);
    expect(composition.output).toBe(composition.output);
    expect("register" in composition).toBe(false);

    composition.dispose();
    source.dispose();
  });

  it.each([
    {
      name: "a first stage not attached to TRAA",
      stages: [{ id: "first-stage", after: "other" }],
      pattern: /immediately follow "traa"/i,
    },
    {
      name: "a non-adjacent predecessor",
      stages: [
        { id: "first-stage", after: "traa" },
        { id: "second-stage", after: "traa" },
      ],
      pattern: /immediately follow "first-stage"/i,
    },
    {
      name: "duplicate stage ids",
      stages: [
        { id: "first-stage", after: "traa" },
        { id: "first-stage", after: "first-stage" },
      ],
      pattern: /declared more than once/i,
    },
  ])("rejects $name before constructing factories", ({ stages, pattern }) => {
    const source = new RenderTarget(320, 180);
    const create = vi.fn();

    expect(() =>
      createPostTraaComposition({
        renderer,
        source,
        drawingBuffer,
        plan: {
          mode: "ordered-declarative-stages",
          resolutionPolicy: "drawing-buffer-exact",
          stages,
        },
        factories: [{ id: "first-stage", create }],
      }),
    ).toThrow(pattern);
    expect(create).not.toHaveBeenCalled();
    source.dispose();
  });

  it("rejects duplicate, missing, and extra factories before allocation", () => {
    const source = new RenderTarget(320, 180);
    const firstOutput = new RenderTarget(320, 180);
    const secondOutput = new RenderTarget(320, 180);
    const extraOutput = new RenderTarget(320, 180);
    const firstFactory = factory("first-stage", firstOutput);
    const secondFactory = factory("second-stage", secondOutput);
    const extraFactory = factory("extra-stage", extraOutput);
    const duplicateCreate = vi.fn();

    expect(() =>
      createPostTraaComposition({
        renderer,
        source,
        drawingBuffer,
        plan: plan(),
        factories: [
          firstFactory,
          secondFactory,
          { id: "first-stage", create: duplicateCreate },
        ],
      }),
    ).toThrow(/registered more than once/i);
    expect(duplicateCreate).not.toHaveBeenCalled();

    expect(() =>
      createPostTraaComposition({
        renderer,
        source,
        drawingBuffer,
        plan: plan(),
        factories: [firstFactory, extraFactory],
      }),
    ).toThrow(/Missing: second-stage.*Extra: extra-stage/i);

    source.dispose();
    firstOutput.dispose();
    secondOutput.dispose();
    extraOutput.dispose();
  });

  it("requires positive drawing-buffer-exact source and stage outputs", () => {
    const source = new RenderTarget(320, 180);
    const wrongSource = new RenderTarget(160, 90);
    const wrongOutput = new RenderTarget(319, 180);
    const create = vi.fn();

    expect(() =>
      createPostTraaComposition({
        renderer,
        source,
        drawingBuffer: { width: 0, height: 180 },
        plan: plan(["first-stage"]),
        factories: [{ id: "first-stage", create }],
      }),
    ).toThrow(/positive integers/i);
    expect(create).not.toHaveBeenCalled();

    expect(() =>
      createPostTraaComposition({
        renderer,
        source: wrongSource,
        drawingBuffer,
        plan: plan(["first-stage"]),
        factories: [{ id: "first-stage", create }],
      }),
    ).toThrow(/TRAA source must be 320x180/i);
    expect(create).not.toHaveBeenCalled();

    const dispose = vi.fn(() => wrongOutput.dispose());
    expect(() =>
      createPostTraaComposition({
        renderer,
        source,
        drawingBuffer,
        plan: plan(["first-stage"]),
        factories: [
          factory("first-stage", wrongOutput, {
            dispose,
          }),
        ],
      }),
    ).toThrow(/stage "first-stage" output must be 320x180/i);
    expect(dispose).toHaveBeenCalledOnce();

    source.dispose();
    wrongSource.dispose();
  });

  it("rejects input/output aliasing and output targets reused across stages", () => {
    const source = new RenderTarget(320, 180);
    const aliasedDispose = vi.fn();

    expect(() =>
      createPostTraaComposition({
        renderer,
        source,
        drawingBuffer,
        plan: plan(["first-stage"]),
        factories: [
          factory("first-stage", source, { dispose: aliasedDispose }),
        ],
      }),
    ).toThrow(/must not render into its input target/i);
    expect(aliasedDispose).toHaveBeenCalledOnce();

    const firstOutput = new RenderTarget(320, 180);
    const secondOutput = new RenderTarget(320, 180);
    const disposeEvents: string[] = [];
    const reuseFactory = (
      id: string,
      output: RenderTarget,
    ): PostTraaStageFactory =>
      factory(id, output, {
        dispose: () => {
          disposeEvents.push(id);
        },
      });
    expect(() =>
      createPostTraaComposition({
        renderer,
        source,
        drawingBuffer,
        plan: plan(["first-stage", "second-stage", "third-stage"]),
        factories: [
          reuseFactory("first-stage", firstOutput),
          reuseFactory("second-stage", secondOutput),
          reuseFactory("third-stage", firstOutput),
        ],
      }),
    ).toThrow(/must own a distinct output target/i);
    expect(disposeEvents).toEqual([
      "third-stage",
      "second-stage",
      "first-stage",
    ]);

    source.dispose();
    firstOutput.dispose();
    secondOutput.dispose();
  });

  it("prepares once, then renders and probes every stage in order", async () => {
    const events: string[] = [];
    const source = new RenderTarget(320, 180);
    const firstOutput = new RenderTarget(320, 180);
    const secondOutput = new RenderTarget(320, 180);
    const composition = createPostTraaComposition({
      renderer,
      source,
      drawingBuffer,
      plan: plan(),
      factories: [
        factory("first-stage", firstOutput, {
          prepare: async () => {
            events.push("prepare:first-stage");
          },
          render: () => {
            events.push("render:first-stage");
          },
          probe: async () => {
            events.push("probe:first-stage");
          },
        }),
        factory("second-stage", secondOutput, {
          prepare: async () => {
            events.push("prepare:second-stage");
          },
          render: () => {
            events.push("render:second-stage");
          },
          probe: async () => {
            events.push("probe:second-stage");
          },
        }),
      ],
    });
    const firstSignal = new AbortController().signal;

    expect(() => composition.render()).toThrow(/finish prepare/i);
    await expect(composition.probe(firstSignal)).rejects.toThrow(
      /finish prepare/i,
    );
    const firstPreparation = composition.prepare(firstSignal);
    const secondPreparation = composition.prepare(new AbortController().signal);
    expect(secondPreparation).toBe(firstPreparation);
    await firstPreparation;
    await composition.prepare(new AbortController().signal);
    composition.render();
    await composition.probe(firstSignal);

    expect(events).toEqual([
      "prepare:first-stage",
      "prepare:second-stage",
      "render:first-stage",
      "render:second-stage",
      "probe:first-stage",
      "probe:second-stage",
    ]);

    composition.dispose();
    source.dispose();
  });

  it("reverse-disposes already constructed stages when a later factory fails", () => {
    const events: string[] = [];
    const source = new RenderTarget(320, 180);
    const firstOutput = new RenderTarget(320, 180);
    const secondOutput = new RenderTarget(320, 180);
    const recordingFactory = (
      id: string,
      output: RenderTarget,
    ): PostTraaStageFactory => ({
      id,
      create: () => {
        events.push(`create:${id}`);
        return factory(id, output, {
          dispose: () => {
            events.push(`dispose:${id}`);
            output.dispose();
          },
        }).create({ renderer, input: source, drawingBuffer });
      },
    });

    expect(() =>
      createPostTraaComposition({
        renderer,
        source,
        drawingBuffer,
        plan: plan(["first", "second", "third"]),
        factories: [
          recordingFactory("first", firstOutput),
          recordingFactory("second", secondOutput),
          {
            id: "third",
            create: () => {
              events.push("create:third");
              throw new Error("third factory failed");
            },
          },
        ],
      }),
    ).toThrow(/third factory failed/i);
    expect(events).toEqual([
      "create:first",
      "create:second",
      "create:third",
      "dispose:second",
      "dispose:first",
    ]);
    source.dispose();
  });

  it("reverse-disposes every allocated stage when preparation fails", async () => {
    const events: string[] = [];
    const source = new RenderTarget(320, 180);
    const outputs = [
      new RenderTarget(320, 180),
      new RenderTarget(320, 180),
      new RenderTarget(320, 180),
    ] as const;
    const createFactory = (
      id: string,
      output: RenderTarget,
    ): PostTraaStageFactory =>
      factory(id, output, {
        prepare: async () => {
          events.push(`prepare:${id}`);
          if (id === "second") {
            throw new Error("second preparation failed");
          }
        },
        dispose: () => {
          events.push(`dispose:${id}`);
          output.dispose();
        },
      });
    const composition = createPostTraaComposition({
      renderer,
      source,
      drawingBuffer,
      plan: plan(["first", "second", "third"]),
      factories: [
        createFactory("first", outputs[0]),
        createFactory("second", outputs[1]),
        createFactory("third", outputs[2]),
      ],
    });

    await expect(
      composition.prepare(new AbortController().signal),
    ).rejects.toThrow(/second preparation failed/i);
    expect(events).toEqual([
      "prepare:first",
      "prepare:second",
      "dispose:third",
      "dispose:second",
      "dispose:first",
    ]);
    expect(() => composition.render()).toThrow(/disposed/i);
    await expect(
      composition.probe(new AbortController().signal),
    ).rejects.toThrow(/disposed/i);
    expect(() => composition.prepare(new AbortController().signal)).toThrow(
      /disposed/i,
    );
    composition.dispose();
    expect(events.filter((event) => event.startsWith("dispose:"))).toHaveLength(
      3,
    );
    source.dispose();
  });

  it("disposes idempotently in reverse order and rejects later use", async () => {
    const events: string[] = [];
    const source = new RenderTarget(320, 180);
    const firstOutput = new RenderTarget(320, 180);
    const secondOutput = new RenderTarget(320, 180);
    const composition = createPostTraaComposition({
      renderer,
      source,
      drawingBuffer,
      plan: plan(),
      factories: [
        factory("first-stage", firstOutput, {
          dispose: () => {
            events.push("dispose:first-stage");
            firstOutput.dispose();
          },
        }),
        factory("second-stage", secondOutput, {
          dispose: () => {
            events.push("dispose:second-stage");
            secondOutput.dispose();
          },
        }),
      ],
    });

    composition.dispose();
    composition.dispose();

    expect(events).toEqual(["dispose:second-stage", "dispose:first-stage"]);
    expect(() => composition.render()).toThrow(/disposed/i);
    await expect(
      composition.probe(new AbortController().signal),
    ).rejects.toThrow(/disposed/i);
    expect(() => composition.prepare(new AbortController().signal)).toThrow(
      /disposed/i,
    );
    source.dispose();
  });
});
