import { Vector3, type Texture } from "three/webgpu";
import {
  cameraFar,
  cameraNear,
  cameraProjectionMatrix,
  cameraViewMatrix,
  equirectUV,
  exp,
  float,
  max,
  mix,
  mrt,
  perspectiveDepthToViewZ,
  positionView,
  refract,
  renderGroup,
  saturate,
  screenUV,
  smoothstep,
  step,
  texture,
  uniform,
  vec3,
  vec4,
  viewportDepthTexture,
  viewportSafeUV,
  viewportSharedTexture,
} from "three/tsl";
import type { HostEnvironmentAdapter } from "../environment.js";
import { readHostEnvironmentState } from "../environment.js";
import type { OpenWaterRuntimeSnapshot, RuntimeStateSink } from "../runtime.js";
import { createWaterPreset } from "../water-preset.js";
import type { createSpectralBandRendering } from "./spectral-bands-rendering.js";

export const OPTICAL_FACTORS_ATTACHMENT = "Real Water optical factors";
export const OPTICAL_DIAGNOSTICS_A_ATTACHMENT =
  "Real Water optical diagnostics A";
export const OPTICAL_DIAGNOSTICS_B_ATTACHMENT =
  "Real Water optical diagnostics B";

const INITIAL_ARTISTIC_CONTROLS = createWaterPreset("swell").artisticControls;
const WATER_IOR = 1.333;
const BEER_LAMBERT_RGB = vec3(0.45, 0.07, 0.016);
const SCATTER_RGB = vec3(0.035, 0.055, 0.085);
const HENYEY_GREENSTEIN_G = 0.72;

type SpectralBandRendering = ReturnType<typeof createSpectralBandRendering>;

export function createWaterOpticsRendering(
  spectral: SpectralBandRendering,
  environment: HostEnvironmentAdapter,
  bodyColor: Texture,
) {
  const initialEnvironment = readHostEnvironmentState(environment);
  const grazingReflection = uniform(
    INITIAL_ARTISTIC_CONTROLS.grazingReflection,
  );
  const environmentReflection = uniform(
    INITIAL_ARTISTIC_CONTROLS.environmentReflection,
  );
  const depthSeeThrough = uniform(INITIAL_ARTISTIC_CONTROLS.depthSeeThrough);
  const depthColoring = uniform(INITIAL_ARTISTIC_CONTROLS.depthColoring);
  const inWaterGlow = uniform(INITIAL_ARTISTIC_CONTROLS.inWaterGlow);
  const crestGlow = uniform(INITIAL_ARTISTIC_CONTROLS.crestGlow);
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
  const sunDirectionUniform = uniform(sunDirectionValue)
    .setName("hostSunDirection")
    .setGroup(renderGroup);
  const sunColorUniform = uniform(sunColorValue)
    .setName("hostSunColor")
    .setGroup(renderGroup);
  const sunIntensity = uniform(initialEnvironment.sunIntensity)
    .setName("hostSunIntensity")
    .setGroup(renderGroup);
  const environmentIntensity = uniform(initialEnvironment.environmentIntensity)
    .setName("hostEnvironmentIntensity")
    .setGroup(renderGroup);
  const sunAngularRadius = uniform(initialEnvironment.sunAngularRadiusRadians)
    .setName("hostSunAngularRadius")
    .setGroup(renderGroup);
  const sunStrength = uniform(
    initialEnvironment.sunIntensity *
      Math.max(
        initialEnvironment.sunColorR,
        initialEnvironment.sunColorG,
        initialEnvironment.sunColorB,
      ),
  )
    .setName("hostSunStrength")
    .setGroup(renderGroup);
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
    sunAngularRadius.value = lighting.sunAngularRadiusRadians;
    sunStrength.value =
      lighting.sunIntensity *
      Math.max(lighting.sunColorR, lighting.sunColorG, lighting.sunColorB);
  };
  sunStrength.onRenderUpdate(() => {
    applyHostLighting();
  });

  const worldNormal = spectral.worldNormalNode;
  const viewDirection = spectral.viewDirectionNode;
  const facing = saturate(worldNormal.dot(viewDirection));
  const fresnelAmount = grazingReflection.mul(0.5).add(0.5);
  const fresnelPow5 = float(1).sub(facing).pow(5);
  const fresnelNode = float(0.02)
    .mul(fresnelAmount)
    .mul(float(1).sub(fresnelPow5))
    .add(fresnelPow5)
    .mul(fresnelAmount)
    .clamp(0, 1);

  const incidentDirection = viewDirection.negate();
  const reflectionDirection = incidentDirection.sub(
    worldNormal.mul(worldNormal.dot(incidentDirection).mul(2)),
  );
  const environmentSample = texture(
    environment.texture as Texture,
    equirectUV(reflectionDirection as never),
  );
  const environmentColor = environmentSample.rgb
    .mul(environmentReflection)
    .mul(environmentIntensity);

  const viewNormal = cameraViewMatrix.mul(vec4(worldNormal, 0)).xyz.normalize();
  const incident = positionView.xyz.normalize();
  const facingNormal = mix(
    viewNormal,
    viewNormal.negate(),
    step(0, viewNormal.dot(incident)),
  );
  const refractedDir = refract(incident, facingNormal, float(1 / WATER_IOR));
  const hitView = positionView.xyz.add(
    refractedDir.mul(depthSeeThrough.mul(3.2)),
  );
  const hitClip = cameraProjectionMatrix.mul(vec4(hitView, 1));
  const surfaceClip = cameraProjectionMatrix.mul(vec4(positionView.xyz, 1));
  const refractionOffset = hitClip.xy
    .div(max(hitClip.w, float(1e-4)))
    .sub(surfaceClip.xy.div(max(surfaceClip.w, float(1e-4))))
    .mul(0.5);
  const refractedUV = viewportSafeUV(screenUV.add(refractionOffset));
  const thicknessNode = createMetricThicknessNode(refractedUV);
  const sceneColor = viewportSharedTexture(refractedUV);
  const absorptionRgb = exp(
    BEER_LAMBERT_RGB.mul(depthColoring).mul(thicknessNode).negate(),
  ).clamp(0, 1);
  const sunDirection = sunDirectionUniform.normalize();
  const sunAmount = saturate(sunStrength);
  const phaseCosine = viewDirection.dot(sunDirection).negate().clamp(-1, 1);
  const phaseG = float(HENYEY_GREENSTEIN_G);
  const phaseG2 = phaseG.mul(phaseG);
  const phaseDenom = float(1)
    .add(phaseG2)
    .sub(phaseG.mul(2).mul(phaseCosine))
    .max(1e-4);
  const phaseNode = float(1).sub(phaseG2).div(phaseDenom.pow(1.5));
  const scatterOptical = SCATTER_RGB.mul(inWaterGlow).mul(thicknessNode);
  const inscatterRgb = float(1)
    .sub(exp(scatterOptical.negate()))
    .mul(phaseNode)
    .mul(sunAmount)
    .clamp(0, 1);
  const scatteringNode = inscatterRgb.x
    .mul(0.2126)
    .add(inscatterRgb.y.mul(0.7152))
    .add(inscatterRgb.z.mul(0.0722))
    .clamp(0, 1);
  const bodySample = texture(bodyColor).rgb.mul(
    spectral.heightNode.mul(0.06).add(1),
  );
  const seeThrough = depthSeeThrough.mul(0.5).add(0.5);
  const transmitted = mix(bodySample, sceneColor.rgb, seeThrough).mul(
    absorptionRgb,
  );
  const sunColor = sunColorUniform.mul(sunIntensity);
  const scattered = bodySample.mul(inscatterRgb);
  const backlight = saturate(viewDirection.dot(sunDirection).negate());
  const thinCrest = smoothstep(
    0.22,
    0.92,
    spectral.heightNode.mul(0.28).add(spectral.slopeStrengthNode),
  );
  const crestNode = thinCrest
    .mul(backlight)
    .mul(sunAmount)
    .mul(crestGlow)
    .clamp(0, 1);
  const crestLift = mix(
    transmitted.add(scattered),
    environmentColor.add(sunColor.mul(0.22)),
    crestNode.mul(0.5),
  );
  const reflected = mix(
    transmitted.add(scattered),
    environmentColor,
    fresnelNode,
  );
  const opticalColor = mix(reflected, crestLift, crestNode.mul(0.35));
  const halfDirection = sunDirection.add(viewDirection).normalize();
  const highlightExponent = float(2)
    .div(sunAngularRadius.mul(sunAngularRadius).max(1e-8))
    .mul(mix(float(1), float(90 / 420), spectral.roughnessNode));
  const highlightNode = worldNormal
    .dot(halfDirection)
    .max(0)
    .pow(highlightExponent)
    .mul(mix(float(0.28), float(0.1), spectral.roughnessNode))
    .mul(sunColor)
    .mul(sunAmount);
  const surfaceColor = opticalColor.add(highlightNode);

  const transmittanceNode = absorptionRgb.x
    .mul(0.2126)
    .add(absorptionRgb.y.mul(0.7152))
    .add(absorptionRgb.z.mul(0.0722))
    .clamp(0, 1);
  const glintNode = highlightNode.x
    .mul(0.2126)
    .add(highlightNode.y.mul(0.7152))
    .add(highlightNode.z.mul(0.0722))
    .clamp(0, 1);
  const environmentReflectionNode = environmentColor.x
    .mul(0.2126)
    .add(environmentColor.y.mul(0.7152))
    .add(environmentColor.z.mul(0.0722))
    .mul(fresnelNode)
    .clamp(0, 1);
  // Alpha is coverage on material.transparent; it is not scalar evidence.
  // Glint is a small specular highlight; RGBA8 quantizes it to zero, so it
  // stays on HalfFloat factors. Crest/transmittance stay on diagnostics A.
  // Scattering and Fresnel-weighted environment-reflection luminance stay on
  // diagnostics B.
  const factorsNode = vec4(fresnelNode, thicknessNode, glintNode, float(1));
  const diagnosticsANode = vec4(crestNode, transmittanceNode, 0, 1);
  const diagnosticsBNode = vec4(
    scatteringNode,
    environmentReflectionNode,
    0,
    1,
  );
  const mrtNode = mrt({
    output: surfaceColor,
    [OPTICAL_FACTORS_ATTACHMENT]: factorsNode,
    [OPTICAL_DIAGNOSTICS_A_ATTACHMENT]: diagnosticsANode,
    [OPTICAL_DIAGNOSTICS_B_ATTACHMENT]: diagnosticsBNode,
  });

  const applySnapshot = (snapshot: OpenWaterRuntimeSnapshot): void => {
    grazingReflection.value = snapshot.artisticControls.grazingReflection;
    environmentReflection.value =
      snapshot.artisticControls.environmentReflection;
    depthSeeThrough.value = snapshot.artisticControls.depthSeeThrough;
    depthColoring.value = snapshot.artisticControls.depthColoring;
    inWaterGlow.value = snapshot.artisticControls.inWaterGlow;
    crestGlow.value = snapshot.artisticControls.crestGlow;
  };

  const sink: RuntimeStateSink = Object.freeze({
    synchronize(snapshot: OpenWaterRuntimeSnapshot): void {
      spectral.sink.synchronize(snapshot);
      applySnapshot(snapshot);
    },
  });

  return Object.freeze({
    colorNode: surfaceColor,
    factorsNode,
    diagnosticsANode,
    diagnosticsBNode,
    mrtNode,
    sink,
    attachment: OPTICAL_FACTORS_ATTACHMENT,
    diagnosticsAAttachment: OPTICAL_DIAGNOSTICS_A_ATTACHMENT,
    diagnosticsBAttachment: OPTICAL_DIAGNOSTICS_B_ATTACHMENT,
  });
}

function createMetricThicknessNode(
  sampleUV: ReturnType<typeof viewportSafeUV>,
) {
  const opaqueDepth = viewportDepthTexture(sampleUV);
  const opaqueViewZ = perspectiveDepthToViewZ(
    opaqueDepth,
    cameraNear,
    cameraFar,
  );
  const waterViewZ = positionView.z;
  const farPlaneMiss = step(float(0.5), cameraFar.add(opaqueViewZ).abs());
  const opaqueInFront = step(float(1e-4), opaqueViewZ.negate());
  return max(waterViewZ.sub(opaqueViewZ), 0)
    .mul(farPlaneMiss)
    .mul(opaqueInFront);
}
