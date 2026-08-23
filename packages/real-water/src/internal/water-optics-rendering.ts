import { type Matrix4, Vector3, type Texture } from "three/webgpu";
import {
  cameraFar,
  cameraNear,
  cameraProjectionMatrix,
  cameraViewMatrix,
  equirectUV,
  exp,
  faceDirection,
  float,
  max,
  mix,
  packNormalToRGB,
  mrt,
  perspectiveDepthToViewZ,
  positionView,
  refract,
  reflect,
  renderGroup,
  saturate,
  screenUV,
  sin,
  smoothstep,
  step,
  texture,
  uniform,
  vec2,
  vec3,
  vec4,
  velocity,
  viewportDepthTexture,
  viewportSafeUV,
  viewportSharedTexture,
} from "three/tsl";
import type { HostEnvironmentAdapter } from "../environment.js";
import { readHostEnvironmentState } from "../environment.js";
import type { OpenWaterRuntimeSnapshot, RuntimeStateSink } from "../runtime.js";
import type { LocalInteractionRenderSnapshot } from "./local-interaction.js";
import { createWaterPreset } from "../water-preset.js";
import type { createSpectralBandRendering } from "./spectral-bands-rendering.js";
import { originSamplePhase } from "./spectral-bands.js";
import type { WaterlineFrameState } from "./waterline-state.js";

export const INVERSE_LINEAR_DEPTH_ATTACHMENT =
  "Real Water inverse linear depth";
export const VIEW_NORMAL_ATTACHMENT = "Real Water view normal";
export const MOTION_VECTORS_ATTACHMENT = "Real Water motion vectors";
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
const FOAM_MICRO_PRIMARY_X = 2.31;
const FOAM_MICRO_PRIMARY_Z = 0.87;
const FOAM_MICRO_SECONDARY_X = -0.73;
const FOAM_MICRO_SECONDARY_Z = 2.67;

type SpectralBandRendering = ReturnType<typeof createSpectralBandRendering>;

export function createWaterOpticsRendering(
  spectral: SpectralBandRendering,
  environment: HostEnvironmentAdapter,
  bodyColor: Texture,
  planar: {
    readonly texture: Texture;
    readonly viewProjection: Matrix4;
    readonly hasOutput: { value: number };
  },
  initialWaterline: WaterlineFrameState,
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
  const foamMicroDetail = uniform(INITIAL_ARTISTIC_CONTROLS.microDetail);
  const foamMicroOriginPhaseX = uniform(0);
  const foamMicroOriginPhaseZ = uniform(0);
  const submersion = uniform(initialWaterline.submersion)
    .setName("waterlineSubmersion")
    .setGroup(renderGroup);
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

  const foamDensity = spectral.foamDensityNode.clamp(0, 1);
  const foamMicroStrength = foamDensity
    .mul(foamMicroDetail)
    .mul(0.04)
    .clamp(0, 0.16);
  // The micro phase is built from the Host origin alone, never from sea level:
  // a sea-level change must not slide the XZ foam pattern across the surface.
  const foamMicroX = sin(
    spectral.hostXNode
      .mul(FOAM_MICRO_PRIMARY_X)
      .add(spectral.hostZNode.mul(FOAM_MICRO_PRIMARY_Z))
      .add(foamMicroOriginPhaseX),
  ).mul(foamMicroStrength);
  const foamMicroZ = sin(
    spectral.hostXNode
      .mul(FOAM_MICRO_SECONDARY_X)
      .add(spectral.hostZNode.mul(FOAM_MICRO_SECONDARY_Z))
      .add(foamMicroOriginPhaseZ),
  ).mul(foamMicroStrength);
  // Order matters: the micro correction belongs to the surface, so it is
  // applied to the upward-facing normal first and the underside orientation is
  // taken afterwards. Orienting first would flip the correction with the face.
  const worldNormal = vec3(
    spectral.worldNormalNode.x.add(foamMicroX),
    spectral.worldNormalNode.y,
    spectral.worldNormalNode.z.add(foamMicroZ),
  ).normalize();
  const orientedWorldNormal = worldNormal.mul(faceDirection);
  const viewDirection = spectral.viewDirectionNode;
  const facing = saturate(orientedWorldNormal.dot(viewDirection));
  const fresnelAmount = grazingReflection.mul(0.5).add(0.5);
  const fresnelPow5 = float(1).sub(facing).pow(5);
  const schlickFresnel = float(0.02)
    .mul(fresnelAmount)
    .mul(float(1).sub(fresnelPow5))
    .add(fresnelPow5)
    .mul(fresnelAmount)
    .clamp(0, 1);

  const incidentDirection = viewDirection.negate();
  const reflectionDirection = reflect(incidentDirection, orientedWorldNormal);
  const environmentSample = texture(
    environment.texture as Texture,
    equirectUV(reflectionDirection as never),
  );
  const environmentColor = environmentSample.rgb
    .mul(environmentReflection)
    .mul(environmentIntensity)
    .mul(float(1).sub(foamDensity.mul(0.9)).clamp(0, 1));
  const planarViewProjection = uniform(planar.viewProjection)
    .setName("planarViewProjection")
    .setGroup(renderGroup);
  const planarHasOutput = uniform(0)
    .setName("planarHasOutput")
    .setGroup(renderGroup);
  planarHasOutput.onRenderUpdate(() => {
    planarHasOutput.value = planar.hasOutput.value;
  });
  const planarWorldPosition = spectral.positionNode.toVarying(
    "realWaterPlanarWorldPosition",
  );
  const planarClip = planarViewProjection.mul(vec4(planarWorldPosition, 1));
  const planarNdc = planarClip.xy.div(max(planarClip.w, float(1e-4)));
  const planarUvUnflipped = planarNdc.mul(0.5).add(0.5);
  const planarSampleUV = vec2(
    planarUvUnflipped.x,
    float(1).sub(planarUvUnflipped.y),
  );
  const clipWPositive = float(1).sub(step(planarClip.w, float(0)));
  const clipDepthValid = step(float(0), planarClip.z).mul(
    step(planarClip.z, planarClip.w),
  );
  const uvValid = step(float(0), planarSampleUV.x)
    .mul(step(planarSampleUV.x, float(1)))
    .mul(step(float(0), planarSampleUV.y))
    .mul(step(planarSampleUV.y, float(1)));
  const projectionValid = clipWPositive.mul(clipDepthValid).mul(uvValid);
  const planarSample = texture(planar.texture, planarSampleUV);
  const planarConfidence = planarHasOutput
    .mul(float(1).sub(submersion))
    .mul(projectionValid)
    .mul(planarSample.a)
    .clamp(0, 1);
  const reflectedRadiance = mix(
    environmentColor,
    planarSample.rgb,
    planarConfidence,
  );

  const viewNormal = cameraViewMatrix
    .mul(vec4(orientedWorldNormal, 0))
    .xyz.normalize();
  const incident = positionView.xyz.normalize();
  const refractedCandidate = refract(
    incident,
    viewNormal,
    mix(float(1 / WATER_IOR), float(WATER_IOR), submersion),
  );
  const refractedValid = step(
    float(1e-6),
    refractedCandidate.dot(refractedCandidate),
  );
  const totalInternalReflection = submersion.mul(float(1).sub(refractedValid));
  const refractedDir = mix(
    reflect(incident, viewNormal),
    refractedCandidate,
    refractedValid,
  );
  const fresnelNode = mix(
    schlickFresnel,
    float(1),
    totalInternalReflection,
  ).clamp(0, 1);
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
  const foamTransmission = float(1).sub(foamDensity.mul(0.94)).clamp(0, 1);
  const transmitted = mix(bodySample, sceneColor.rgb, seeThrough)
    .mul(absorptionRgb)
    .mul(foamTransmission);
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
    .mul(float(1).sub(foamDensity.mul(0.8)).clamp(0, 1))
    .clamp(0, 1);
  const crestLift = mix(
    transmitted.add(scattered),
    reflectedRadiance.add(sunColor.mul(0.22)),
    crestNode.mul(0.5),
  );
  const reflected = mix(
    transmitted.add(scattered),
    reflectedRadiance,
    fresnelNode,
  );
  const opticalColor = mix(reflected, crestLift, crestNode.mul(0.35));
  const foamDiffuse = vec3(0.78, 0.86, 0.9)
    .mul(environmentIntensity.mul(0.28).add(sunAmount.mul(0.52)))
    .add(sunColor.mul(0.08));
  const whitewaterColor = mix(
    opticalColor,
    foamDiffuse,
    foamDensity.mul(0.86).clamp(0, 1),
  );
  const surfaceRoughnessNode = mix(
    spectral.roughnessNode,
    float(0.94),
    foamDensity.mul(0.9).clamp(0, 1),
  );
  const halfDirection = sunDirection.add(viewDirection).normalize();
  const highlightExponent = float(2)
    .div(sunAngularRadius.mul(sunAngularRadius).max(1e-8))
    .mul(mix(float(1), float(90 / 420), surfaceRoughnessNode));
  const highlightNode = orientedWorldNormal
    .dot(halfDirection)
    .max(0)
    .pow(highlightExponent)
    .mul(mix(float(0.28), float(0.1), surfaceRoughnessNode))
    .mul(sunColor)
    .mul(sunAmount);
  const surfaceColor = whitewaterColor.add(highlightNode);

  const transmittanceNode = absorptionRgb.x
    .mul(0.2126)
    .add(absorptionRgb.y.mul(0.7152))
    .add(absorptionRgb.z.mul(0.0722))
    .mul(foamTransmission)
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
    [VIEW_NORMAL_ATTACHMENT]: vec4(
      packNormalToRGB(viewNormal),
      surfaceRoughnessNode,
    ),
    [MOTION_VECTORS_ATTACHMENT]: velocity,
    [OPTICAL_FACTORS_ATTACHMENT]: factorsNode,
    [OPTICAL_DIAGNOSTICS_A_ATTACHMENT]: diagnosticsANode,
    [OPTICAL_DIAGNOSTICS_B_ATTACHMENT]: diagnosticsBNode,
  });

  const applyMicroOriginPhases = (
    snapshot: Pick<OpenWaterRuntimeSnapshot, "originX" | "originZ">,
  ): void => {
    foamMicroOriginPhaseX.value = originSamplePhase(
      snapshot.originX,
      snapshot.originZ,
      FOAM_MICRO_PRIMARY_X,
      FOAM_MICRO_PRIMARY_Z,
    );
    foamMicroOriginPhaseZ.value = originSamplePhase(
      snapshot.originX,
      snapshot.originZ,
      FOAM_MICRO_SECONDARY_X,
      FOAM_MICRO_SECONDARY_Z,
    );
  };

  const applySnapshot = (snapshot: OpenWaterRuntimeSnapshot): void => {
    grazingReflection.value = snapshot.artisticControls.grazingReflection;
    environmentReflection.value =
      snapshot.artisticControls.environmentReflection;
    depthSeeThrough.value = snapshot.artisticControls.depthSeeThrough;
    depthColoring.value = snapshot.artisticControls.depthColoring;
    inWaterGlow.value = snapshot.artisticControls.inWaterGlow;
    crestGlow.value = snapshot.artisticControls.crestGlow;
    foamMicroDetail.value = snapshot.artisticControls.microDetail;
    applyMicroOriginPhases(snapshot);
  };

  const sink: RuntimeStateSink = Object.freeze({
    synchronize(
      snapshot: OpenWaterRuntimeSnapshot,
      interaction: LocalInteractionRenderSnapshot,
    ): void {
      spectral.sink.synchronize(snapshot, interaction);
      applySnapshot(snapshot);
    },
    observe(snapshot: OpenWaterRuntimeSnapshot): void {
      spectral.sink.observe?.(snapshot);
      applyMicroOriginPhases(snapshot);
    },
  });
  const waterline = Object.freeze({
    synchronize(state: WaterlineFrameState): void {
      submersion.value = state.submersion;
    },
  });

  return Object.freeze({
    colorNode: surfaceColor,
    factorsNode,
    diagnosticsANode,
    diagnosticsBNode,
    mrtNode,
    sink,
    waterline,
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
