import { describe, expect, it } from "vitest";
import { createQaHostSimulationController } from "./qa-simulation-controller.js";

describe("QA Host Simulation Controller", () => {
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
