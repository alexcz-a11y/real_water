import {
  SUPPORTED_HOST_ENVIRONMENT_REFLECTION,
  SUPPORTED_HOST_SUN_ANGULAR_RADIUS_RADIANS,
  createStaticHostEnvironmentAdapter,
  createSupportedHostEnvironmentReflection,
  type HostEnvironmentAdapter,
  type HostEnvironmentReflectionResource,
  type HostEnvironmentState,
  type HostTexture,
} from "../src/index.js";

export const SUPPORTED_ENVIRONMENT_FINGERPRINT =
  SUPPORTED_HOST_ENVIRONMENT_REFLECTION.fingerprint;

export const TEST_ENVIRONMENT_STATE = Object.freeze({
  sunDirectionX: 0.32,
  sunDirectionY: 0.84,
  sunDirectionZ: 0.44,
  sunColorR: 1,
  sunColorG: 0.96,
  sunColorB: 0.82,
  sunIntensity: 1,
  environmentIntensity: 1,
  sunAngularRadiusRadians: SUPPORTED_HOST_SUN_ANGULAR_RADIUS_RADIANS,
}) satisfies HostEnvironmentState;

export function createTestEnvironmentReflection(
  texture: HostTexture | null = null,
): HostEnvironmentReflectionResource {
  return createSupportedHostEnvironmentReflection(texture);
}

export function createTestEnvironmentAdapter(
  texture: HostTexture | null = null,
  state: HostEnvironmentState = TEST_ENVIRONMENT_STATE,
): HostEnvironmentAdapter {
  return createStaticHostEnvironmentAdapter(
    createTestEnvironmentReflection(texture),
    state,
  );
}
