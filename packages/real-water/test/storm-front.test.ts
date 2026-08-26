import { describe, expect, it } from "vitest";
import type { HostEnvironmentSnapshot } from "../src/environment.js";
import {
  createStormFrontController,
  evaluateStormFrontFrame,
  evaluateStormFrontRainCorrection,
} from "../src/storm-front.js";

const CLEAR_ENVIRONMENT: HostEnvironmentSnapshot = Object.freeze({
  lighting: Object.freeze({
    sunDirectionX: 0.32,
    sunDirectionY: 0.84,
    sunDirectionZ: 0.44,
    sunColorR: 1,
    sunColorG: 0.96,
    sunColorB: 0.82,
    sunIntensity: 1,
    environmentIntensity: 1,
    sunAngularRadiusRadians: 0.069,
  }),
  weather: Object.freeze({
    windDirectionX: 0.8,
    windDirectionZ: 0.6,
    windStrength: 0.35,
    gustStrength: 0.15,
    rainIntensity: 0,
  }),
  atmosphere: Object.freeze({
    cloudCoverage: 0.15,
    cloudShadowStrength: 0.1,
    horizonHaze: 0.25,
    stormAerosolIntensity: 0,
    lightningIntensity: 0,
  }),
});

describe("Storm Front frame", () => {
  it("is inert when every conditional Storm effect is off", () => {
    const frame = evaluateStormFrontFrame(0x1234_5678, 3_600, {
      ...CLEAR_ENVIRONMENT,
      atmosphere: {
        ...CLEAR_ENVIRONMENT.atmosphere,
        cloudCoverage: 0,
        cloudShadowStrength: 0,
        horizonHaze: 0,
      },
    });

    expect(frame).toMatchObject({
      rainRippleStrength: 0,
      rainSprayStrength: 0,
      stormAerosolStrength: 0,
      cloudShadowStrength: 0,
      lightningStrength: 0,
      glintIllumination: 1,
      foamIllumination: 1,
      reflectionIllumination: 1,
    });
    expect(evaluateStormFrontRainCorrection(12, -7, frame)).toEqual({
      height: 0,
      slopeX: 0,
      slopeZ: 0,
    });
  });

  it("derives one coherent optical and atmospheric response", () => {
    const frame = evaluateStormFrontFrame(0x0bad_cafe, 3_690, {
      ...CLEAR_ENVIRONMENT,
      weather: {
        ...CLEAR_ENVIRONMENT.weather,
        windStrength: 1.2,
        gustStrength: 0.6,
        rainIntensity: 0.9,
      },
      atmosphere: {
        cloudCoverage: 0.8,
        cloudShadowStrength: 0.75,
        horizonHaze: 0.4,
        stormAerosolIntensity: 0.7,
        lightningIntensity: 0.5,
      },
    });

    expect(frame.rainRippleStrength).toBe(0.9);
    expect(frame.rainSprayStrength).toBeCloseTo(0.711, 12);
    expect(frame.stormAerosolStrength).toBe(0.7);
    expect(frame.cloudShadowStrength).toBeCloseTo(0.6, 12);
    expect(frame.lightningStrength).toBe(0.5);
    expect(frame.glintIllumination).toBeCloseTo(1.175, 12);
    expect(frame.foamIllumination).toBeCloseTo(1.18, 12);
    expect(frame.reflectionIllumination).toBeCloseTo(1.19, 12);
    expect(frame.atmosphere.horizonHaze).toBe(0.4);
    expect(frame.atmosphere.stormAerosol).toBe(0.7);
    expect(frame.atmosphere.cloudShadow).toBeCloseTo(0.6, 12);
    expect(frame.atmosphere.lightning).toBe(0.5);
  });

  it("adds deterministic rain detail without replacing the base ocean", () => {
    const first = evaluateStormFrontFrame(0xa511_e9b3, 3_777, {
      ...CLEAR_ENVIRONMENT,
      weather: { ...CLEAR_ENVIRONMENT.weather, rainIntensity: 1 },
    });
    const replay = evaluateStormFrontFrame(0xa511_e9b3, 3_777, {
      ...CLEAR_ENVIRONMENT,
      weather: { ...CLEAR_ENVIRONMENT.weather, rainIntensity: 1 },
    });
    const otherSeed = evaluateStormFrontFrame(0x63d8_35f1, 3_777, {
      ...CLEAR_ENVIRONMENT,
      weather: { ...CLEAR_ENVIRONMENT.weather, rainIntensity: 1 },
    });
    const correction = evaluateStormFrontRainCorrection(4.25, -2.5, first);

    expect(replay).toEqual(first);
    expect(otherSeed.spatialPhase).not.toBe(first.spatialPhase);
    expect(correction.height).not.toBe(0);
    expect({
      height: 2.5 + correction.height,
      slopeX: -0.2 + correction.slopeX,
      slopeZ: 0.35 + correction.slopeZ,
    }).not.toEqual({
      height: correction.height,
      slopeX: correction.slopeX,
      slopeZ: correction.slopeZ,
    });
  });

  it("changes its candidate-input revision when weather changes at one tick", () => {
    const dry = evaluateStormFrontFrame(7, 120, CLEAR_ENVIRONMENT);
    const wet = evaluateStormFrontFrame(7, 120, {
      ...CLEAR_ENVIRONMENT,
      weather: { ...CLEAR_ENVIRONMENT.weather, rainIntensity: 0.5 },
    });

    expect(
      evaluateStormFrontFrame(7, 120, CLEAR_ENVIRONMENT).inputRevision,
    ).toBe(dry.inputRevision);
    expect(wet.inputRevision).not.toBe(dry.inputRevision);
  });

  it("publishes one coherent current/previous pair and resets discontinuities", () => {
    let environment = CLEAR_ENVIRONMENT;
    const controller = createStormFrontController(() => environment);

    const first = controller.synchronize({
      seed: 9,
      tick: 10,
      simulationResetRevision: 0,
    });
    environment = Object.freeze({
      ...CLEAR_ENVIRONMENT,
      weather: Object.freeze({
        ...CLEAR_ENVIRONMENT.weather,
        rainIntensity: 0.75,
      }),
    });
    const second = controller.synchronize({
      seed: 9,
      tick: 11,
      simulationResetRevision: 0,
    });

    expect(first.current).toEqual(first.previous);
    expect(second.previous).toEqual(first.current);
    expect(second.current.rainRippleStrength).toBe(0.75);

    expect(
      controller.synchronize({
        seed: 9,
        tick: 11,
        simulationResetRevision: 0,
      }),
    ).toBe(second);
    environment = Object.freeze({
      ...environment,
      atmosphere: Object.freeze({
        ...environment.atmosphere,
        lightningIntensity: 1,
      }),
    });
    const sameTickChange = controller.synchronize({
      seed: 9,
      tick: 11,
      simulationResetRevision: 0,
    });
    expect(sameTickChange.previous).toEqual(second.previous);
    expect(sameTickChange.current.lightningStrength).toBe(1);

    const reset = controller.synchronize({
      seed: 9,
      tick: 1,
      simulationResetRevision: 1,
    });
    expect(reset.previous).toEqual(reset.current);
  });
});
