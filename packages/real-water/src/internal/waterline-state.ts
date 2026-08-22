import { Vector3, type PerspectiveCamera } from "three/webgpu";
import type { ArtisticControls, OpenWaterRuntimeSnapshot } from "../runtime.js";
import {
  evaluateSpectralSurface,
  prepareSpectralBands,
  spectralBandPhaseOffset,
} from "./spectral-bands.js";

export const WATERLINE_ENTER_METRES = 0.08;
export const WATERLINE_EXIT_METRES = 0.18;

export type WaterlineClassification = "above" | "crossing" | "below";

export type WaterlineSampleState = Pick<
  OpenWaterRuntimeSnapshot,
  | "seed"
  | "timeSeconds"
  | "originX"
  | "originZ"
  | "seaLevelMetres"
  | "artisticControls"
>;

export interface WaterlineFrameState {
  readonly classification: WaterlineClassification;
  readonly surfaceHeightMetres: number;
  readonly signedDistanceMetres: number;
  readonly submersion: number;
  readonly transitionRevision: number;
  readonly lensWetnessImpulse: boolean;
}

export interface WaterlineFrameCandidate {
  readonly state: WaterlineFrameState;
  readonly transitioned: boolean;
}

export interface WaterlineStateController {
  preview(
    camera: PerspectiveCamera,
    state: WaterlineSampleState,
    discontinuous?: boolean,
  ): WaterlineFrameCandidate;
  commit(candidate: WaterlineFrameCandidate): WaterlineFrameState;
  current(): WaterlineFrameState | undefined;
}

export function createWaterlineStateController(): WaterlineStateController {
  const cameraWorldPosition = new Vector3();
  let committed: WaterlineFrameState | undefined;

  return {
    preview(camera, state, discontinuous = false) {
      camera.getWorldPosition(cameraWorldPosition);
      const surface = evaluateSpectralSurface(
        cameraWorldPosition.x,
        cameraWorldPosition.z,
        state.originX,
        state.originZ,
        spectralBandPhaseOffset(state.seed),
        state.timeSeconds,
        prepareSpectralBands(state.artisticControls),
        state.artisticControls.crestSharpness,
        state.artisticControls.timeScale,
      );
      const surfaceHeightMetres = surface.height + state.seaLevelMetres;
      const signedDistanceMetres = cameraWorldPosition.y - surfaceHeightMetres;
      const classification = classifyWaterline(
        signedDistanceMetres,
        discontinuous ? undefined : committed?.classification,
      );
      const transitioned =
        committed !== undefined && classification !== committed.classification;
      const frameState = Object.freeze({
        classification,
        surfaceHeightMetres,
        signedDistanceMetres,
        submersion: waterlineSubmersion(signedDistanceMetres),
        transitionRevision:
          (committed?.transitionRevision ?? 0) + (transitioned ? 1 : 0),
        lensWetnessImpulse:
          committed?.classification === "below" && classification !== "below",
      });
      return Object.freeze({ state: frameState, transitioned });
    },
    commit(candidate) {
      committed = candidate.state;
      return committed;
    },
    current: () => committed,
  };
}

export function createInitialWaterlineSampleState(
  state: Readonly<{
    readonly seed: number;
    readonly timeSeconds: number;
    readonly originX: number;
    readonly originZ: number;
    readonly seaLevelMetres: number;
  }>,
  artisticControls: ArtisticControls,
): WaterlineSampleState {
  return Object.freeze({
    seed: state.seed,
    timeSeconds: state.timeSeconds,
    originX: state.originX,
    originZ: state.originZ,
    seaLevelMetres: state.seaLevelMetres,
    artisticControls,
  });
}

function classifyWaterline(
  signedDistanceMetres: number,
  previous: WaterlineClassification | undefined,
): WaterlineClassification {
  if (previous === "above") {
    return signedDistanceMetres <= WATERLINE_ENTER_METRES
      ? "crossing"
      : "above";
  }
  if (previous === "below") {
    return signedDistanceMetres >= -WATERLINE_ENTER_METRES
      ? "crossing"
      : "below";
  }
  if (signedDistanceMetres >= WATERLINE_EXIT_METRES) {
    return "above";
  }
  if (signedDistanceMetres <= -WATERLINE_EXIT_METRES) {
    return "below";
  }
  return "crossing";
}

function waterlineSubmersion(signedDistanceMetres: number): number {
  const linear = Math.min(
    1,
    Math.max(
      0,
      (WATERLINE_EXIT_METRES - signedDistanceMetres) /
        (WATERLINE_EXIT_METRES * 2),
    ),
  );
  return linear * linear * (3 - 2 * linear);
}
