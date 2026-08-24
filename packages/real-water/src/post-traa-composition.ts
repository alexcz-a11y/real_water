import type { Renderer, RenderTarget } from "three/webgpu";

export interface PostTraaStageDeclaration {
  readonly id: string;
  readonly after: "traa" | string;
}

export interface PostTraaCompositionPlan {
  readonly mode: "ordered-declarative-stages";
  readonly resolutionPolicy: "drawing-buffer-exact";
  readonly stages: readonly PostTraaStageDeclaration[];
}

export interface PreparedPostTraaStage {
  readonly id: string;
  readonly output: RenderTarget;
  prepare(signal: AbortSignal): Promise<void>;
  render(): void;
  probe(signal: AbortSignal): Promise<void>;
  dispose(): void;
}

export interface PostTraaStageFactory {
  readonly id: string;
  create(context: {
    readonly renderer: Renderer;
    readonly input: RenderTarget;
    readonly drawingBuffer: Readonly<{ width: number; height: number }>;
  }): PreparedPostTraaStage;
}

export interface PreparedPostTraaComposition {
  readonly output: RenderTarget;
  readonly stageIds: readonly string[];
  prepare(signal: AbortSignal): Promise<void>;
  render(): void;
  probe(signal: AbortSignal): Promise<void>;
  dispose(): void;
}

type CompositionState = "created" | "preparing" | "prepared" | "disposed";

export function createPostTraaComposition(options: {
  readonly renderer: Renderer;
  readonly source: RenderTarget;
  readonly drawingBuffer: Readonly<{ width: number; height: number }>;
  readonly plan: PostTraaCompositionPlan;
  readonly factories: readonly PostTraaStageFactory[];
}): PreparedPostTraaComposition {
  const drawingBuffer = validateDrawingBuffer(options.drawingBuffer);
  assertTargetSize(options.source, drawingBuffer, "TRAA source");
  const declarations = validatePlan(options.plan);
  const factoriesById = validateFactories(options.factories, declarations);
  const stages: PreparedPostTraaStage[] = [];
  const claimedTargets = new Set<RenderTarget>([options.source]);
  let input = options.source;

  try {
    for (const declaration of declarations) {
      const factory = factoriesById.get(declaration.id);
      if (factory === undefined) {
        throw new Error(
          `Post-TRAA stage factory "${declaration.id}" disappeared during construction.`,
        );
      }
      const stage = factory.create({
        renderer: options.renderer,
        input,
        drawingBuffer,
      });
      if (stage === null || typeof stage !== "object") {
        throw new TypeError(
          `Post-TRAA factory "${declaration.id}" did not return a prepared stage.`,
        );
      }
      stages.push(stage);
      if (stage.id !== declaration.id) {
        throw new TypeError(
          `Post-TRAA factory "${declaration.id}" returned stage "${stage.id}".`,
        );
      }
      if (stage.output === input) {
        throw new TypeError(
          `Post-TRAA stage "${stage.id}" must not render into its input target.`,
        );
      }
      if (claimedTargets.has(stage.output)) {
        throw new TypeError(
          `Post-TRAA stage "${stage.id}" must own a distinct output target.`,
        );
      }
      assertTargetSize(
        stage.output,
        drawingBuffer,
        `Post-TRAA stage "${stage.id}" output`,
      );
      claimedTargets.add(stage.output);
      input = stage.output;
    }
  } catch (cause) {
    throwAfterCleanup(
      cause,
      disposeStagesReverse(stages),
      "Post-TRAA composition construction failed",
    );
  }

  const output = input;
  const stageIds = Object.freeze(declarations.map(({ id }) => id));
  let state: CompositionState = "created";
  let preparation: Promise<void> | undefined;
  const readState = (): CompositionState => state;

  const composition: PreparedPostTraaComposition = {
    output,
    stageIds,
    prepare(signal) {
      assertNotDisposed(state);
      if (state === "prepared") {
        return Promise.resolve();
      }
      if (preparation !== undefined) {
        return preparation;
      }

      state = "preparing";
      preparation = (async () => {
        try {
          for (const stage of stages) {
            await stage.prepare(signal);
          }
          if (readState() === "disposed") {
            throw new Error(
              "Post-TRAA composition was disposed while preparation was in progress.",
            );
          }
          state = "prepared";
        } catch (cause) {
          if (readState() !== "disposed") {
            state = "disposed";
            throwAfterCleanup(
              cause,
              disposeStagesReverse(stages),
              "Post-TRAA composition preparation failed",
            );
          }
          throw cause;
        }
      })();
      return preparation;
    },
    render() {
      assertPrepared(state, "render");
      for (const stage of stages) {
        stage.render();
      }
    },
    async probe(signal) {
      assertPrepared(state, "probe");
      for (const stage of stages) {
        assertPrepared(state, "probe");
        await stage.probe(signal);
      }
      assertPrepared(state, "probe");
    },
    dispose() {
      if (state === "disposed") {
        return;
      }
      state = "disposed";
      const cleanupErrors = disposeStagesReverse(stages);
      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          cleanupErrors,
          "Post-TRAA composition disposal failed.",
        );
      }
    },
  };

  return Object.freeze(composition);
}

function validateDrawingBuffer(
  value: Readonly<{ width: number; height: number }>,
): Readonly<{ width: number; height: number }> {
  if (
    !Number.isInteger(value.width) ||
    value.width <= 0 ||
    !Number.isInteger(value.height) ||
    value.height <= 0
  ) {
    throw new RangeError(
      "Post-TRAA drawing-buffer dimensions must be positive integers.",
    );
  }
  return Object.freeze({ width: value.width, height: value.height });
}

function validatePlan(
  plan: PostTraaCompositionPlan,
): readonly PostTraaStageDeclaration[] {
  if (plan.mode !== "ordered-declarative-stages") {
    throw new TypeError(
      'Post-TRAA composition mode must be "ordered-declarative-stages".',
    );
  }
  if (plan.resolutionPolicy !== "drawing-buffer-exact") {
    throw new TypeError(
      'Post-TRAA resolution policy must be "drawing-buffer-exact".',
    );
  }
  if (plan.stages.length === 0) {
    throw new RangeError(
      "Post-TRAA composition must declare at least one stage after TRAA.",
    );
  }

  const ids = new Set<string>();
  let requiredPredecessor = "traa";
  const declarations = plan.stages.map((stage) => {
    assertStageId(stage.id, "stage");
    if (ids.has(stage.id)) {
      throw new TypeError(
        `Post-TRAA stage id "${stage.id}" is declared more than once.`,
      );
    }
    ids.add(stage.id);
    if (stage.after !== requiredPredecessor) {
      throw new TypeError(
        `Post-TRAA stage "${stage.id}" must immediately follow "${requiredPredecessor}", not "${stage.after}".`,
      );
    }
    requiredPredecessor = stage.id;
    return Object.freeze({ id: stage.id, after: stage.after });
  });

  return Object.freeze(declarations);
}

function validateFactories(
  factories: readonly PostTraaStageFactory[],
  declarations: readonly PostTraaStageDeclaration[],
): ReadonlyMap<string, PostTraaStageFactory> {
  const factoriesById = new Map<string, PostTraaStageFactory>();
  for (const factory of factories) {
    assertStageId(factory.id, "factory");
    if (factoriesById.has(factory.id)) {
      throw new TypeError(
        `Post-TRAA factory id "${factory.id}" is registered more than once.`,
      );
    }
    factoriesById.set(factory.id, factory);
  }

  const declaredIds = new Set(declarations.map(({ id }) => id));
  const missingIds = declarations
    .map(({ id }) => id)
    .filter((id) => !factoriesById.has(id));
  const extraIds = [...factoriesById.keys()].filter(
    (id) => !declaredIds.has(id),
  );
  if (missingIds.length > 0 || extraIds.length > 0) {
    throw new TypeError(
      [
        "Post-TRAA factories must exactly match the declared stages.",
        missingIds.length > 0 ? `Missing: ${missingIds.join(", ")}.` : "",
        extraIds.length > 0 ? `Extra: ${extraIds.join(", ")}.` : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }
  return factoriesById;
}

function assertStageId(id: string, kind: "stage" | "factory"): void {
  if (typeof id !== "string" || id.trim().length === 0) {
    throw new TypeError(`Post-TRAA ${kind} id must be a non-empty string.`);
  }
  if (id === "traa") {
    throw new TypeError(
      `Post-TRAA ${kind} id "traa" is reserved for the chain input.`,
    );
  }
}

function assertTargetSize(
  target: RenderTarget,
  drawingBuffer: Readonly<{ width: number; height: number }>,
  label: string,
): void {
  if (
    target === null ||
    typeof target !== "object" ||
    target.width !== drawingBuffer.width ||
    target.height !== drawingBuffer.height
  ) {
    const actual =
      target !== null && typeof target === "object"
        ? `${String(target.width)}x${String(target.height)}`
        : String(target);
    throw new RangeError(
      `${label} must be ${drawingBuffer.width}x${drawingBuffer.height}; received ${actual}.`,
    );
  }
}

function assertNotDisposed(state: CompositionState): void {
  if (state === "disposed") {
    throw new Error("Post-TRAA composition is disposed.");
  }
}

function assertPrepared(
  state: CompositionState,
  operation: "render" | "probe",
): void {
  assertNotDisposed(state);
  if (state !== "prepared") {
    throw new Error(
      `Post-TRAA composition must finish prepare() before ${operation}().`,
    );
  }
}

function disposeStagesReverse(
  stages: readonly PreparedPostTraaStage[],
): unknown[] {
  const cleanupErrors: unknown[] = [];
  for (let index = stages.length - 1; index >= 0; index -= 1) {
    const stage = stages[index];
    if (stage === undefined) {
      continue;
    }
    try {
      stage.dispose();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  return cleanupErrors;
}

function throwAfterCleanup(
  cause: unknown,
  cleanupErrors: readonly unknown[],
  message: string,
): never {
  if (cleanupErrors.length === 0) {
    throw cause;
  }
  throw new AggregateError([cause, ...cleanupErrors], `${message}.`, {
    cause,
  });
}
