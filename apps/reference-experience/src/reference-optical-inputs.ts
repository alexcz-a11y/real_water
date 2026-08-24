import {
  ClampToEdgeWrapping,
  DataTexture,
  NearestFilter,
  RepeatWrapping,
  SRGBColorSpace,
} from "three";
import {
  SUPPORTED_HOST_SUN_ANGULAR_RADIUS_RADIANS,
  createReferenceEnvironmentPreset,
  createStaticHostEnvironmentAdapter,
  createSupportedHostEnvironmentRadianceBytes,
  createSupportedHostEnvironmentReflection,
  type HostEnvironmentAdapter,
  type HostEnvironmentSnapshot,
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
  setEnvironmentState(state: HostEnvironmentSnapshot): void;
}

export function createReferenceEnvironmentAdapter(): ReferenceEnvironmentAdapter {
  const reflection = createSupportedHostEnvironmentReflection(
    createEnvironmentRadiance(),
  );
  const reference = createReferenceEnvironmentPreset();
  let state: HostEnvironmentSnapshot = Object.freeze({
    lighting: Object.freeze({ ...REFERENCE_ENVIRONMENT_LIGHTING }),
    weather: Object.freeze({ ...reference.weather }),
    atmosphere: Object.freeze({ ...reference.atmosphere }),
  });
  const validate = (candidate: HostEnvironmentSnapshot) =>
    createStaticHostEnvironmentAdapter(
      reflection,
      candidate.lighting,
      candidate.weather,
      candidate.atmosphere,
    ).snapshot();
  return Object.freeze({
    reflection: createStaticHostEnvironmentAdapter(
      reflection,
      state.lighting,
      state.weather,
      state.atmosphere,
    ).reflection,
    texture: reflection.texture ?? null,
    snapshot: () => state,
    setLighting(lighting: HostEnvironmentState) {
      state = validate({ ...state, lighting });
    },
    setEnvironmentState(nextState: HostEnvironmentSnapshot) {
      state = validate(nextState);
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
