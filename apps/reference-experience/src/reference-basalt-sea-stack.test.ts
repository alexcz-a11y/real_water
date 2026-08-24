import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Mesh } from "three";
import { describe, expect, it } from "vitest";
import {
  BASALT_SEA_STACK_FIELD,
  BASALT_SEA_STACK_PALETTE,
  buildColumnField,
  createReferenceBasaltSeaStack,
  disposeReferenceBasaltSeaStack,
  envelopeRadius,
  type BasaltSeaStackRuntime,
} from "./reference-basalt-sea-stack.js";

/**
 * The committed sculpt spec is the reconstruction's single source of truth (ADR-0022 keeps the
 * pixels out of the repository and the text evidence in it). These tests exist so the module and
 * that record cannot drift apart silently, and so the three geometry defects the img2threejs
 * geometry gates caught during T28b stay caught.
 */
const specPath = fileURLToPath(
  new URL(
    "../../../docs/reconstructions/basalt-sea-stack-v001.sculpt.json",
    import.meta.url,
  ),
);
const spec = JSON.parse(readFileSync(specPath, "utf8")) as {
  componentTree: {
    id: string;
    level: string;
    geometryDescriptor?: { proceduralField?: Record<string, unknown> };
  }[];
  performanceBudget: { targetTriangles: number; maxDrawCalls: number };
};

const proceduralField =
  spec.componentTree[0]?.geometryDescriptor?.proceduralField;

function meshesOf(
  root: ReturnType<typeof createReferenceBasaltSeaStack>,
): Mesh[] {
  const meshes: Mesh[] = [];
  root.traverse((child) => {
    if (child instanceof Mesh) meshes.push(child);
  });
  return meshes;
}

/** Divergence-theorem volume. Negative means the mesh is wound inside-out. */
function signedVolume(mesh: Mesh): number {
  const position = mesh.geometry.getAttribute("position");
  let volume = 0;
  for (let index = 0; index + 2 < position.count; index += 3) {
    const ax = position.getX(index);
    const ay = position.getY(index);
    const az = position.getZ(index);
    const bx = position.getX(index + 1);
    const by = position.getY(index + 1);
    const bz = position.getZ(index + 1);
    const cx = position.getX(index + 2);
    const cy = position.getY(index + 2);
    const cz = position.getZ(index + 2);
    volume +=
      (ax * (by * cz - bz * cy) +
        ay * (bz * cx - bx * cz) +
        az * (bx * cy - by * cx)) /
      6;
  }
  return volume;
}

describe("reference basalt sea stack", () => {
  it("carries the committed sculpt spec's field parameters verbatim", () => {
    expect(proceduralField).toBeDefined();
    const field = proceduralField as Record<string, unknown>;
    const numeric = [
      "seed",
      "aboveWaterHeightMetres",
      "maxRadiusMetres",
      "submergedDepthMetres",
      "meanColumnWidthMetres",
      "latticeJitter",
      "courseCount",
      "topJitterColumnWidths",
      "spireFraction",
      "topFaceDomeFraction",
      "arrisChamferFractionOfWidth",
      "verticalArrisFractionOfWidth",
      "jointGrooveInsetFractionOfWidth",
      "minJointHalfGapMetres",
      "courseStepRaggednessProbability",
      "drumTopFraction",
      "brokenColumnFraction",
    ] as const;
    for (const key of numeric) {
      expect(
        BASALT_SEA_STACK_FIELD[key as keyof typeof BASALT_SEA_STACK_FIELD],
        `spec and module disagree on ${key}`,
      ).toBe(field[key]);
    }
    // The spec wraps the points with their axis meaning and provenance; the module carries only
    // the numbers, which are the part that must not drift.
    const envelope = field.envelopeProfile as { points: number[][] };
    expect(BASALT_SEA_STACK_FIELD.envelopeProfile).toEqual(envelope.points);
    expect(BASALT_SEA_STACK_FIELD.spireBonusCourses).toEqual(
      field.spireBonusCourses,
    );
    expect(BASALT_SEA_STACK_FIELD.brokenColumnRange).toEqual(
      field.brokenColumnRange,
    );
  });

  it("scales to the Reference Bible's 250-300 m band, above water", () => {
    expect(
      BASALT_SEA_STACK_FIELD.aboveWaterHeightMetres,
    ).toBeGreaterThanOrEqual(250);
    expect(BASALT_SEA_STACK_FIELD.aboveWaterHeightMetres).toBeLessThanOrEqual(
      300,
    );
  });

  it("is deterministic: the same seed builds the same field twice", () => {
    const first = buildColumnField();
    const second = buildColumnField();
    expect(second).toHaveLength(first.length);
    for (let index = 0; index < first.length; index += 1) {
      expect(second[index]?.topY).toBe(first[index]?.topY);
      expect(second[index]?.centre.x).toBe(first[index]?.centre.x);
    }
  });

  it("cuts every mesh at the waterline so the stain boundary is a mesh boundary", () => {
    const root = createReferenceBasaltSeaStack();
    const runtime = root.userData.sculptRuntime as BasaltSeaStackRuntime;
    for (const [name, mesh] of Object.entries(runtime.meshes)) {
      const position = mesh.geometry.getAttribute("position");
      let lowest = Infinity;
      let highest = -Infinity;
      for (let index = 0; index < position.count; index += 1) {
        const y = position.getY(index);
        lowest = Math.min(lowest, y);
        highest = Math.max(highest, y);
      }
      if (name === "shaft-course") {
        // The submerged shaft owns everything below the waterline and nothing above it.
        expect(highest).toBeCloseTo(0, 6);
        expect(lowest).toBeCloseTo(
          -BASALT_SEA_STACK_FIELD.submergedDepthMetres,
          6,
        );
      } else {
        // Every above-water course starts exactly on the plane, never through it.
        expect(lowest, `${name} dips below the waterline`).toBeCloseTo(0, 6);
        expect(highest).toBeGreaterThan(0);
      }
    }
    disposeReferenceBasaltSeaStack(root);
  });

  it("winds every mesh outward", () => {
    // Regression guard: every mesh shipped inside-out at first, which pointed the explicit normals
    // into the solid and inverted `normalWorld.y` — the input the bleached-top material keys on.
    const root = createReferenceBasaltSeaStack();
    for (const mesh of meshesOf(root)) {
      expect(
        signedVolume(mesh),
        `${mesh.name} is wound inside-out`,
      ).toBeGreaterThan(0);
    }
    disposeReferenceBasaltSeaStack(root);
  });

  it("paints only the declared vertex-colour regions", () => {
    // `vertex_region_gate.py` classifies vertices against this exact palette, so a stray colour
    // shows up as an unclassified fringe rather than as the variation it was meant to be.
    const root = createReferenceBasaltSeaStack();
    const expected = Object.values(BASALT_SEA_STACK_PALETTE).length;
    const seen = new Set<string>();
    for (const mesh of meshesOf(root)) {
      const colour = mesh.geometry.getAttribute("color");
      for (let index = 0; index < colour.count; index += 1) {
        seen.add(
          `${colour.getX(index).toFixed(4)},${colour.getY(index).toFixed(4)},${colour
            .getZ(index)
            .toFixed(4)}`,
        );
      }
    }
    expect(seen.size).toBe(expected);
    disposeReferenceBasaltSeaStack(root);
  });

  it("builds every part the spec names, and nothing anonymous", () => {
    const root = createReferenceBasaltSeaStack();
    const runtime = root.userData.sculptRuntime as BasaltSeaStackRuntime;
    const named = new Set([
      ...Object.keys(runtime.nodes),
      ...Object.keys(runtime.meshes),
    ]);
    for (const component of spec.componentTree) {
      expect(
        named.has(component.id),
        `${component.id} was specified and not built`,
      ).toBe(true);
    }
    for (const mesh of meshesOf(root)) expect(mesh.name).not.toBe("");
    expect(Object.keys(runtime.sockets)).toEqual(["waterline", "base-plane"]);
    disposeReferenceBasaltSeaStack(root);
  });

  it("stays inside the spec's triangle and draw-call budget", () => {
    const root = createReferenceBasaltSeaStack();
    const meshes = meshesOf(root);
    const triangles = meshes.reduce(
      (total, mesh) =>
        total + Math.floor(mesh.geometry.getAttribute("position").count / 3),
      0,
    );
    expect(triangles).toBeLessThanOrEqual(
      spec.performanceBudget.targetTriangles,
    );
    expect(meshes.length).toBeLessThanOrEqual(
      spec.performanceBudget.maxDrawCalls,
    );
    disposeReferenceBasaltSeaStack(root);
  });

  it("exposes a tick that is present and does nothing", () => {
    // Bible section 10 fixes this asset as static. The hook exists so the runtime hierarchy is
    // uniform with the animated assets; the empty body is the record that static was a decision.
    const root = createReferenceBasaltSeaStack();
    const tick = root.userData.tick as (delta: number) => void;
    expect(typeof tick).toBe("function");
    const before = meshesOf(root).map((mesh) => mesh.position.toArray().join());
    tick(1 / 60);
    expect(
      meshesOf(root).map((mesh) => mesh.position.toArray().join()),
    ).toEqual(before);
    disposeReferenceBasaltSeaStack(root);
  });

  it("keeps the envelope monotone enough to invert into column heights", () => {
    expect(envelopeRadius(0)).toBeGreaterThan(envelopeRadius(1));
    expect(envelopeRadius(0.1)).toBeGreaterThan(envelopeRadius(0.9));
  });
});
