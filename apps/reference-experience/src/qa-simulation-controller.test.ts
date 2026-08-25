import { describe, expect, it } from "vitest";
import { createQaHostSimulationController } from "./qa-simulation-controller.js";

describe("QA Host Simulation Controller", () => {
  it("runs Host integration once at each current tick before advancing state", () => {
    const integratedTicks: number[] = [];
    const completedTicks: number[] = [];
    const order: string[] = [];
    let resetCount = 0;
    const simulation = createQaHostSimulationController({
      integrateFixedStep() {
        integratedTicks.push(simulation.snapshot().tick);
        order.push(`integrate:${simulation.snapshot().tick}`);
      },
      afterFixedStep(state) {
        completedTicks.push(state.tick);
        order.push(`after:${state.tick}`);
        expect(simulation.snapshot()).toBe(state);
      },
      reset() {
        resetCount += 1;
      },
    });

    expect(simulation.advance(3).tick).toBe(3);
    expect(integratedTicks).toEqual([0, 1, 2]);
    expect(completedTicks).toEqual([1, 2, 3]);
    expect(order).toEqual([
      "integrate:0",
      "after:1",
      "integrate:1",
      "after:2",
      "integrate:2",
      "after:3",
    ]);
    expect(simulation.reset(25).tick).toBe(0);
    expect(resetCount).toBe(1);
    expect(completedTicks).toEqual([1, 2, 3]);
  });

  it("starts at simulationResetRevision 0 and increments every explicit reset", () => {
    const simulation = createQaHostSimulationController();
    expect(simulation.snapshot()).toEqual({
      seed: 0,
      tick: 0,
      timeSeconds: 0,
      paused: false,
      originX: 0,
      originZ: 0,
      seaLevelMetres: 0,
      simulationResetRevision: 0,
    });

    const first = simulation.reset(0x4000_0000);
    expect(first.simulationResetRevision).toBe(1);
    expect(first.seed).toBe(0x4000_0000);
    expect(first.tick).toBe(0);

    const sameSeed = simulation.reset(0x4000_0000);
    expect(sameSeed.simulationResetRevision).toBe(2);
    expect(sameSeed.tick).toBe(0);
    expect(sameSeed.timeSeconds).toBe(0);

    const advanced = simulation.advance(24);
    expect(advanced.tick).toBe(24);
    expect(advanced.simulationResetRevision).toBe(2);

    const shifted = simulation.setOrigin(4, -2);
    expect(shifted.originX).toBe(4);
    expect(shifted.simulationResetRevision).toBe(2);

    const raised = simulation.setSeaLevel(4);
    expect(raised.seaLevelMetres).toBe(4);
    expect(simulation.advance(1).seaLevelMetres).toBe(4);
    expect(simulation.setOrigin(0, 0).seaLevelMetres).toBe(4);
    expect(() => simulation.setSeaLevel(Number.NaN)).toThrowError(/finite/i);
    expect(simulation.reset(7).seaLevelMetres).toBe(0);
  });
});
