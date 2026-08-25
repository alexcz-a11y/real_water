import { describe, expect, it } from "vitest";
import { REFERENCE_SHOWCASE_SEED, type HostSimulationState } from "real-water";
import {
  REFERENCE_SIMULATION_SEED,
  createReferenceHostSimulationController,
} from "./reference-simulation-controller.js";

describe("Reference Host Simulation Controller", () => {
  it("starts at tick 0 and catches 0/16/17/34 ms up to 60 Hz", () => {
    const simulation = createReferenceHostSimulationController();
    expect(REFERENCE_SIMULATION_SEED).toBe(REFERENCE_SHOWCASE_SEED);
    expect(simulation.snapshot()).toEqual({
      seed: REFERENCE_SIMULATION_SEED,
      tick: 0,
      timeSeconds: 0,
      paused: false,
      originX: 0,
      originZ: 0,
      seaLevelMetres: 0,
      simulationResetRevision: 0,
    });
    expect(simulation.start(0).tick).toBe(0);
    expect(simulation.beforePresent(0).tick).toBe(0);
    expect(simulation.beforePresent(16).tick).toBe(0);
    expect(simulation.beforePresent(17).tick).toBe(1);
    expect(simulation.beforePresent(34).tick).toBe(2);
    expect(simulation.beforePresent(17).tick).toBe(2);
    expect(simulation.snapshot().timeSeconds).toBe(2 / 60);
    expect(simulation.snapshot().paused).toBe(false);
    expect(simulation.snapshot().simulationResetRevision).toBe(0);
    expect(simulation.snapshot().seed).toBe(REFERENCE_SIMULATION_SEED);
  });

  it("does not advance before the first start timestamp", () => {
    const simulation = createReferenceHostSimulationController();
    expect(() => simulation.beforePresent(17)).toThrowError(/has not started/i);
    expect(simulation.snapshot().tick).toBe(0);
    simulation.start(100);
    expect(simulation.beforePresent(116).tick).toBe(0);
    expect(simulation.beforePresent(117).tick).toBe(1);
    simulation.start(0);
    expect(simulation.snapshot().tick).toBe(1);
  });

  it("runs every 60 Hz Host integration before a 30 FPS presentation", () => {
    const integratedTicks: number[] = [];
    const completedTicks: number[] = [];
    const controller: {
      current?: ReturnType<typeof createReferenceHostSimulationController>;
    } = {};
    const simulation = createReferenceHostSimulationController({
      integrateFixedStep: () => {
        integratedTicks.push(controller.current?.snapshot().tick ?? -1);
      },
      afterFixedStep: (state) => {
        completedTicks.push(state.tick);
        expect(controller.current?.snapshot()).toEqual(state);
      },
    });
    controller.current = simulation;

    simulation.start(0);
    expect(simulation.beforePresent(34).tick).toBe(2);
    expect(integratedTicks).toEqual([0, 1]);
    expect(completedTicks).toEqual([1, 2]);
    expect(simulation.interpolationAlpha(42)).toBeCloseTo(0.52, 12);
  });

  it("reports every crossed fixed tick exactly once after incrementing it", () => {
    const completedTicks: number[] = [];
    const simulation = createReferenceHostSimulationController({
      afterFixedStep: ({ tick }) => {
        completedTicks.push(tick);
      },
    });

    simulation.start(0);
    expect(simulation.beforePresent(84).tick).toBe(5);
    expect(completedTicks).toEqual([1, 2, 3, 4, 5]);

    simulation.beforePresent(84);
    simulation.beforePresent(50);
    expect(completedTicks).toEqual([1, 2, 3, 4, 5]);
  });

  it("caps a long Host gap and drops excess wall time before the next frame", () => {
    let integrationCount = 0;
    const simulation = createReferenceHostSimulationController({
      integrateFixedStep: () => {
        integrationCount += 1;
      },
    });
    simulation.start(0);

    expect(simulation.beforePresent(1_000).tick).toBe(8);
    expect(integrationCount).toBe(8);
    expect(simulation.beforePresent(1_017).tick).toBe(9);
    expect(integrationCount).toBe(9);
  });

  it("keeps every fixed-step callback stopped across multiple paused Host intervals", () => {
    const integratedTicks: number[] = [];
    const completedTicks: number[] = [];
    const simulation = createReferenceHostSimulationController({
      integrateFixedStep: () => {
        integratedTicks.push(simulation.snapshot().tick);
      },
      afterFixedStep: ({ tick }) => {
        completedTicks.push(tick);
      },
    });

    simulation.start(100);
    expect(simulation.beforePresent(117).tick).toBe(1);
    const alphaBeforePause = simulation.interpolationAlpha(117);
    expect(simulation.setPaused(true)).toMatchObject({
      tick: 1,
      paused: true,
    });

    expect(simulation.beforePresent(1_000)).toMatchObject({
      tick: 1,
      timeSeconds: 1 / 60,
      paused: true,
    });
    expect(simulation.beforePresent(5_000).tick).toBe(1);
    expect(simulation.beforePresent(10_000).tick).toBe(1);
    expect(simulation.interpolationAlpha(10_000)).toBeCloseTo(
      alphaBeforePause,
      12,
    );
    expect(integratedTicks).toEqual([0]);
    expect(completedTicks).toEqual([1]);
  });

  it("rebases the first resumed frame and then advances continuously", () => {
    let integrationCount = 0;
    const simulation = createReferenceHostSimulationController({
      integrateFixedStep: () => {
        integrationCount += 1;
      },
    });

    simulation.start(100);
    simulation.beforePresent(117);
    simulation.setPaused(true);
    simulation.beforePresent(10_000);
    expect(simulation.setPaused(false)).toMatchObject({
      tick: 1,
      paused: false,
    });

    expect(() => simulation.beforePresent(1_000_000)).not.toThrow();
    expect(simulation.snapshot().tick).toBe(1);
    expect(simulation.beforePresent(1_000_017).tick).toBe(2);
    expect(simulation.beforePresent(1_000_034).tick).toBe(3);
    expect(integrationCount).toBe(3);
    expect(simulation.interpolationAlpha(1_000_034)).toBeGreaterThanOrEqual(0);
    expect(simulation.interpolationAlpha(1_000_034)).toBeLessThanOrEqual(1);
  });

  it("resets a running simulation, invokes the Host reset, and rebases at tick 0", () => {
    const resetStates: HostSimulationState[] = [];
    const simulation = createReferenceHostSimulationController({
      reset: () => {
        resetStates.push(simulation.snapshot());
      },
    });

    simulation.start(250);
    expect(simulation.beforePresent(284).tick).toBe(2);
    expect(simulation.interpolationAlpha(284)).toBeCloseTo(0.04, 12);

    expect(simulation.reset()).toEqual({
      seed: REFERENCE_SIMULATION_SEED,
      tick: 0,
      timeSeconds: 0,
      paused: false,
      originX: 0,
      originZ: 0,
      seaLevelMetres: 0,
      simulationResetRevision: 1,
    });
    expect(resetStates).toEqual([simulation.snapshot()]);
    expect(simulation.interpolationAlpha(100_000)).toBe(0);
    expect(simulation.beforePresent(100_000).tick).toBe(0);
    expect(simulation.interpolationAlpha(100_000)).toBe(0);
    expect(simulation.beforePresent(100_017).tick).toBe(1);

    expect(simulation.reset()).toMatchObject({
      tick: 0,
      timeSeconds: 0,
      paused: false,
      simulationResetRevision: 2,
    });
    expect(resetStates).toHaveLength(2);
  });

  it("preserves pause across reset and resumes from the reset baseline", () => {
    let integrationCount = 0;
    let resetCount = 0;
    const completedStates: Array<{
      readonly tick: number;
      readonly simulationResetRevision: number;
    }> = [];
    const simulation = createReferenceHostSimulationController({
      integrateFixedStep: () => {
        integrationCount += 1;
      },
      afterFixedStep: ({ tick, simulationResetRevision }) => {
        completedStates.push({ tick, simulationResetRevision });
      },
      reset: () => {
        resetCount += 1;
      },
    });

    simulation.start(0);
    simulation.beforePresent(34);
    simulation.setPaused(true);
    simulation.beforePresent(5_000);
    expect(simulation.reset()).toMatchObject({
      seed: REFERENCE_SIMULATION_SEED,
      tick: 0,
      timeSeconds: 0,
      paused: true,
      simulationResetRevision: 1,
    });
    expect(resetCount).toBe(1);
    expect(simulation.interpolationAlpha(50_000)).toBe(0);
    expect(simulation.beforePresent(50_000).tick).toBe(0);
    expect(simulation.beforePresent(100_000).tick).toBe(0);
    expect(integrationCount).toBe(2);

    simulation.setPaused(false);
    expect(simulation.beforePresent(1_000_000).tick).toBe(0);
    expect(simulation.beforePresent(1_000_017).tick).toBe(1);
    expect(integrationCount).toBe(3);
    expect(completedStates).toEqual([
      { tick: 1, simulationResetRevision: 0 },
      { tick: 2, simulationResetRevision: 0 },
      { tick: 1, simulationResetRevision: 1 },
    ]);
  });

  it("fails closed for invalid inputs, repeated start, and backward timestamps", () => {
    let integrationCount = 0;
    const simulation = createReferenceHostSimulationController({
      integrateFixedStep: () => {
        integrationCount += 1;
      },
    });

    expect(() => simulation.start(Number.NaN)).toThrowError(/finite RAF/i);
    expect(() =>
      simulation.beforePresent(Number.POSITIVE_INFINITY),
    ).toThrowError(/finite RAF/i);
    expect(() =>
      simulation.interpolationAlpha(Number.NEGATIVE_INFINITY),
    ).toThrowError(/finite RAF/i);
    expect(() =>
      simulation.setPaused("paused" as unknown as boolean),
    ).toThrowError(/must be boolean/i);
    expect(simulation.snapshot()).toMatchObject({ tick: 0, paused: false });

    simulation.start(100);
    simulation.beforePresent(134);
    expect(simulation.snapshot().tick).toBe(2);
    expect(integrationCount).toBe(2);
    expect(simulation.start(-10).tick).toBe(2);
    expect(simulation.beforePresent(50).tick).toBe(2);
    expect(simulation.interpolationAlpha(50)).toBe(0);
    expect(integrationCount).toBe(2);
  });

  it("accepts exactly eight catch-up ticks and rebases a ninth-tick gap", () => {
    let integrationCount = 0;
    const simulation = createReferenceHostSimulationController({
      integrateFixedStep: () => {
        integrationCount += 1;
      },
    });

    simulation.start(0);
    expect(simulation.beforePresent(134).tick).toBe(8);
    expect(integrationCount).toBe(8);
    expect(simulation.beforePresent(284).tick).toBe(16);
    expect(simulation.snapshot().tick).toBe(16);
    expect(integrationCount).toBe(16);
    expect(simulation.beforePresent(301).tick).toBe(17);
  });
});
