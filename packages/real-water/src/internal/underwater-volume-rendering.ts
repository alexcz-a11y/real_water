import {
  Matrix4,
  Vector3,
  type PerspectiveCamera,
  type Texture,
} from "three/webgpu";
import {
  exp,
  float,
  getViewPosition,
  max,
  mix,
  screenUV,
  sin,
  smoothstep,
  step,
  texture,
  uniform,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import {
  readHostEnvironmentState,
  type HostEnvironmentAdapter,
} from "../environment.js";
import type { QualityProfileUnderwaterVolume } from "../quality-profile.js";
import type { OpenWaterRuntimeSnapshot, RuntimeStateSink } from "../runtime.js";
import { createWaterPreset } from "../water-preset.js";
import type { WaterlineFrameState } from "./waterline-state.js";

const INITIAL_ARTISTIC_CONTROLS = createWaterPreset("swell").artisticControls;
const ABSORPTION_RGB = vec3(0.055, 0.025, 0.012);
const CLEAR_VOLUME_COLOR = vec3(0.035, 0.13, 0.17);
const SATURATED_VOLUME_COLOR = vec3(0.008, 0.3, 0.4);

/** Package-private, prepared full-frame underwater composition graph. */
export function createUnderwaterVolumeRendering(
  sourceColor: Texture,
  sceneDepth: Texture,
  camera: PerspectiveCamera,
  environment: HostEnvironmentAdapter,
  initialWaterline: WaterlineFrameState,
  policy: QualityProfileUnderwaterVolume,
) {
  const initialEnvironment = readHostEnvironmentState(environment);
  const underwaterHaze = uniform(INITIAL_ARTISTIC_CONTROLS.underwaterHaze);
  const underwaterTurbidity = uniform(
    INITIAL_ARTISTIC_CONTROLS.underwaterTurbidity,
  );
  const underwaterLightShafts = uniform(
    INITIAL_ARTISTIC_CONTROLS.underwaterLightShafts,
  );
  const underwaterColor = uniform(INITIAL_ARTISTIC_CONTROLS.underwaterColor);
  const underwaterExposure = uniform(
    INITIAL_ARTISTIC_CONTROLS.underwaterExposure,
  );
  const submersion = uniform(initialWaterline.submersion);
  const signedCameraDistance = uniform(initialWaterline.signedDistanceMetres);
  const projectionMatrixInverse = uniform(
    new Matrix4().copy(camera.projectionMatrixInverse),
  );
  const viewMatrix = uniform(new Matrix4().copy(camera.matrixWorldInverse));
  const cameraWorldMatrix = uniform(new Matrix4().copy(camera.matrixWorld));
  const sunDirectionValue = new Vector3(
    initialEnvironment.sunDirectionX,
    initialEnvironment.sunDirectionY,
    initialEnvironment.sunDirectionZ,
  );
  const sunColorValue = new Vector3(
    initialEnvironment.sunColorR,
    initialEnvironment.sunColorG,
    initialEnvironment.sunColorB,
  );
  const sunDirection = uniform(sunDirectionValue);
  const sunColor = uniform(sunColorValue);
  const sunIntensity = uniform(initialEnvironment.sunIntensity);
  const environmentIntensity = uniform(initialEnvironment.environmentIntensity);
  const sunStrength = uniform(
    initialEnvironment.sunIntensity *
      Math.max(
        initialEnvironment.sunColorR,
        initialEnvironment.sunColorG,
        initialEnvironment.sunColorB,
      ),
  );
  const applyHostLighting = (): void => {
    const lighting = readHostEnvironmentState(environment);
    sunDirectionValue.set(
      lighting.sunDirectionX,
      lighting.sunDirectionY,
      lighting.sunDirectionZ,
    );
    sunColorValue.set(
      lighting.sunColorR,
      lighting.sunColorG,
      lighting.sunColorB,
    );
    sunIntensity.value = lighting.sunIntensity;
    environmentIntensity.value = lighting.environmentIntensity;
    sunStrength.value =
      lighting.sunIntensity *
      Math.max(lighting.sunColorR, lighting.sunColorG, lighting.sunColorB);
  };
  sunStrength.onRenderUpdate(applyHostLighting);

  const uvNode = screenUV;
  const source = texture(sourceColor, uvNode);
  const depth = texture(sceneDepth, uvNode).r;
  const viewPosition = getViewPosition(uvNode, depth, projectionMatrixInverse);
  const metricDistance = viewPosition
    .length()
    .min(float(policy.maxDistanceMetres));
  const viewRay = viewPosition.normalize();
  const worldRay = cameraWorldMatrix.mul(vec4(viewRay, 0)).xyz.normalize();
  const rayWorldY = worldRay.y;
  const cameraBelow = float(1).sub(step(float(0), signedCameraDistance));
  const upwardRay = step(float(1e-4), rayWorldY);
  const downwardRay = float(1).sub(step(float(-1e-4), rayWorldY));
  const exitDistance = signedCameraDistance
    .negate()
    .div(max(rayWorldY, float(1e-4)))
    .clamp(0, policy.maxDistanceMetres);
  const entryDistance = signedCameraDistance
    .negate()
    .div(rayWorldY.min(float(-1e-4)))
    .clamp(0, policy.maxDistanceMetres);
  const belowWaterDistance = mix(
    metricDistance,
    metricDistance.min(exitDistance),
    upwardRay,
  );
  const aboveWaterDistance = metricDistance
    .sub(entryDistance)
    .max(0)
    .mul(downwardRay);
  const waterDistance = mix(
    aboveWaterDistance,
    belowWaterDistance,
    cameraBelow,
  ).clamp(0, policy.maxDistanceMetres);
  const volumeCoverage = step(float(1e-4), waterDistance)
    .mul(submersion)
    .clamp(0, 1);
  const sunView = viewMatrix
    .mul(vec4(sunDirection.normalize(), 0))
    .xyz.normalize();
  const phase = smoothstep(-0.2, 0.95, viewRay.dot(sunView)).pow(2);
  const sunAmount = sunStrength.clamp(0, 2);

  const density = underwaterTurbidity.add(underwaterHaze.mul(0.2)).max(0);
  const transmittanceRgb = exp(
    ABSORPTION_RGB.mul(density).mul(waterDistance).negate(),
  ).clamp(0, 1);
  const transmittance = transmittanceRgb.x
    .mul(0.2126)
    .add(transmittanceRgb.y.mul(0.7152))
    .add(transmittanceRgb.z.mul(0.0722))
    .clamp(0, 1);
  const hazeAmount = float(1)
    .sub(exp(waterDistance.mul(underwaterHaze).mul(-0.035)))
    .clamp(0, 1);
  const scatteringAmount = float(1)
    .sub(
      exp(
        waterDistance
          .mul(underwaterHaze.mul(0.018).add(underwaterTurbidity.mul(0.028)))
          .negate(),
      ),
    )
    .clamp(0, 1);
  const authoredColor = mix(
    CLEAR_VOLUME_COLOR,
    SATURATED_VOLUME_COLOR,
    underwaterColor.mul(0.5).clamp(0, 1),
  );

  const sunScreen = vec2(sunView.x, sunView.y.negate());
  const sunScreenLength = max(sunScreen.length(), float(1e-4));
  const sunAxis = sunScreen.div(sunScreenLength);
  const sunPerpendicular = vec2(sunAxis.y.negate(), sunAxis.x);
  const shaftCoordinate = uvNode
    .sub(0.5)
    .dot(sunPerpendicular)
    .mul(52)
    .add(waterDistance.mul(0.07));
  const shaftBands = sin(shaftCoordinate).mul(0.5).add(0.5).pow(7);

  const shadowUv = uvNode.sub(sunAxis.mul(0.035)).clamp(0.001, 0.999);
  const shadowDepth = texture(sceneDepth, shadowUv).r;
  const shadowViewPosition = getViewPosition(
    shadowUv,
    shadowDepth,
    projectionMatrixInverse,
  );
  const shadowDistance = shadowViewPosition
    .length()
    .min(float(policy.maxDistanceMetres));
  const shadowHasGeometry = float(1).sub(step(float(0.9999), shadowDepth));
  const shadowOcclusion = step(shadowDistance.add(0.35), metricDistance)
    .mul(shadowHasGeometry)
    .clamp(0, 1);
  const shadowVisibility = float(1).sub(shadowOcclusion.mul(0.82));
  const shaftAmount = shaftBands
    .mul(scatteringAmount)
    .mul(phase)
    .mul(sunAmount)
    .mul(underwaterLightShafts)
    .mul(shadowVisibility)
    .clamp(0, 1);

  const ambientScattering = authoredColor
    .mul(hazeAmount)
    .mul(environmentIntensity.mul(0.32).add(0.14));
  const directionalScattering = sunColor
    .mul(sunIntensity)
    .mul(scatteringAmount)
    .mul(phase)
    .mul(0.2);
  const shaftRadiance = sunColor.mul(sunIntensity).mul(shaftAmount).mul(0.65);
  const exposure = underwaterExposure.mul(0.5).add(0.5);
  const underwaterRgb = source.rgb
    .mul(transmittanceRgb)
    .add(ambientScattering)
    .add(directionalScattering)
    .add(shaftRadiance)
    .mul(exposure);
  const composedRgb = mix(source.rgb, underwaterRgb, volumeCoverage);
  const colorNode = vec4(composedRgb, source.a);
  const diagnosticsNode = vec4(
    mix(float(1), transmittance, volumeCoverage),
    scatteringAmount.mul(volumeCoverage),
    shaftAmount.mul(volumeCoverage),
    shadowOcclusion.mul(scatteringAmount).mul(volumeCoverage),
  );

  const applySnapshot = (snapshot: OpenWaterRuntimeSnapshot): void => {
    underwaterHaze.value = snapshot.artisticControls.underwaterHaze;
    underwaterTurbidity.value = snapshot.artisticControls.underwaterTurbidity;
    underwaterLightShafts.value =
      snapshot.artisticControls.underwaterLightShafts;
    underwaterColor.value = snapshot.artisticControls.underwaterColor;
    underwaterExposure.value = snapshot.artisticControls.underwaterExposure;
  };
  const sink: RuntimeStateSink = Object.freeze({
    synchronize(snapshot: OpenWaterRuntimeSnapshot): void {
      applySnapshot(snapshot);
    },
  });

  return Object.freeze({
    colorNode,
    diagnosticsNode,
    sink,
    waterline: Object.freeze({
      synchronize(state: WaterlineFrameState): void {
        submersion.value = state.submersion;
        signedCameraDistance.value = state.signedDistanceMetres;
      },
    }),
    syncCamera(nextCamera: PerspectiveCamera): void {
      projectionMatrixInverse.value.copy(nextCamera.projectionMatrixInverse);
      viewMatrix.value.copy(nextCamera.matrixWorldInverse);
      cameraWorldMatrix.value.copy(nextCamera.matrixWorld);
    },
  });
}
