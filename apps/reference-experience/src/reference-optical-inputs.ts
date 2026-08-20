import {
  ClampToEdgeWrapping,
  DataTexture,
  NearestFilter,
  RepeatWrapping,
  SRGBColorSpace,
} from "three";
import {
  SUPPORTED_HOST_SUN_ANGULAR_RADIUS_RADIANS,
  createStaticHostEnvironmentAdapter,
  createSupportedHostEnvironmentRadianceBytes,
  createSupportedHostEnvironmentReflection,
  type HostEnvironmentAdapter,
  type HostEnvironmentState,
} from "real-water";

export const REFERENCE_ENVIRONMENT_LIGHTING = Object.freeze({
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

export interface ReferenceEnvironmentAdapter extends HostEnvironmentAdapter {
  setLighting(state: HostEnvironmentState): void;
}

export function createReferenceEnvironmentAdapter(): ReferenceEnvironmentAdapter {
  const reflection = createSupportedHostEnvironmentReflection(
    createEnvironmentRadiance(),
  );
  let lighting: HostEnvironmentState = { ...REFERENCE_ENVIRONMENT_LIGHTING };
  return Object.freeze({
    reflection: createStaticHostEnvironmentAdapter(reflection, lighting)
      .reflection,
    texture: reflection.texture ?? null,
    snapshot: () =>
      createStaticHostEnvironmentAdapter(reflection, lighting).snapshot(),
    setLighting(state: HostEnvironmentState) {
      lighting = createStaticHostEnvironmentAdapter(
        reflection,
        state,
      ).snapshot();
    },
  });
}

function createEnvironmentRadiance(): DataTexture {
  const width = 8;
  const height = 4;
  const texture = new DataTexture(
    createSupportedHostEnvironmentRadianceBytes(),
    width,
    height,
  );
  texture.name = "Reference environment radiance";
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
