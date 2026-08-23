import { describe, expect, it } from "vitest";
import {
  REFERENCE_SIMULATION_SEED,
  createReferenceHostSimulationController,
} from "./reference-simulation-controller.js";

describe("Reference Host Simulation Controller", () => {
  it("starts at tick 0 and catches 0/16/17/34 ms up to 60 Hz", () => {
    const simulation = createReferenceHostSimulationController();
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
    expect(simulation.snapshot().seed).toBe(0);
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
    const controller: {
      current?: ReturnType<typeof createReferenceHostSimulationController>;
    } = {};
    const simulation = createReferenceHostSimulationController({
      integrateFixedStep: () => {
        integratedTicks.push(controller.current?.snapshot().tick ?? -1);
      },
    });
    controller.current = simulation;

    simulation.start(0);
    expect(simulation.beforePresent(34).tick).toBe(2);
    expect(integratedTicks).toEqual([0, 1]);
    expect(simulation.interpolationAlpha(42)).toBeCloseTo(0.52, 12);
  });

  it("rejects a long gap before starting an unbounded catch-up spiral", () => {
    let integrationCount = 0;
    const simulation = createReferenceHostSimulationController({
      integrateFixedStep: () => {
        integrationCount += 1;
      },
    });
    simulation.start(0);

    expect(() => simulation.beforePresent(1_000)).toThrowError(
      /bounded fixed-step catch-up/i,
    );
    expect(integrationCount).toBe(0);
    expect(simulation.snapshot().tick).toBe(0);
  });
});
