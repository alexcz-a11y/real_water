import { Vector3 } from "three";
import type { PerspectiveCamera } from "three";
import type { ReferenceProxyVessel } from "./reference-proxy-vessel.js";

const DEFAULT_TARGET = Object.freeze([0, 0, 0] as const);
const MIN_CAMERA_DISTANCE = 0.5;
const MAX_CAMERA_DISTANCE = 4_000;
const MIN_ZOOM_DISTANCE = MIN_CAMERA_DISTANCE + 1e-12;
const MAX_ZOOM_DISTANCE = MAX_CAMERA_DISTANCE - 1e-9;
const MIN_POLAR_ANGLE_RADIANS = Math.PI / 36;
const MAX_POLAR_ANGLE_RADIANS = Math.PI - MIN_POLAR_ANGLE_RADIANS;
const ORBIT_RADIANS_PER_PIXEL = Math.PI / 360;
const ZOOM_EXPONENT_PER_PIXEL = 0.0015;

export interface ReferenceSandboxCameraKeyframe {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly verticalFovDegrees: number;
}

export interface ReferenceSandboxCameraSnapshot extends ReferenceSandboxCameraKeyframe {
  readonly distance: number;
}

export interface ReferenceSandboxCameraControllerOptions {
  readonly onCameraCut?: () => void;
  readonly resetKeyframe?: ReferenceSandboxCameraKeyframe;
}

export interface ReferenceSandboxCameraController {
  beginPointerDrag(pointerId: number, clientX: number, clientY: number): void;
  movePointerDrag(pointerId: number, clientX: number, clientY: number): void;
  endPointerDrag(pointerId: number): void;
  zoomByWheelDelta(deltaY: number): void;
  reset(): void;
  inspect(): ReferenceSandboxCameraSnapshot;
}

interface ReferenceSandboxListenerTarget {
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void;
}

interface ReferenceSandboxDocumentTarget extends ReferenceSandboxListenerTarget {
  readonly hidden: boolean;
  readonly visibilityState: DocumentVisibilityState;
}

export interface ReferenceSandboxControlsOptions {
  readonly vessel: ReferenceProxyVessel;
  readonly camera: ReferenceSandboxCameraController;
  readonly eventTarget?: ReferenceSandboxListenerTarget;
  readonly documentTarget?: ReferenceSandboxDocumentTarget;
}

export interface ReferenceSandboxControlsSnapshot {
  readonly enabled: boolean;
  readonly attached: boolean;
  readonly heldKeys: readonly string[];
  readonly camera: ReferenceSandboxCameraSnapshot;
}

type ReferenceSandboxControlsSubscriber = (
  snapshot: ReferenceSandboxControlsSnapshot,
) => void;

interface ReferenceSandboxControlsAttachment {
  dispose(): void;
}

export interface ReferenceSandboxControls {
  attach(
    stage: HTMLElement,
    canvas: HTMLCanvasElement,
  ): ReferenceSandboxControlsAttachment;
  setEnabled(enabled: boolean): void;
  resetCamera(): void;
  snapshot(): ReferenceSandboxControlsSnapshot;
  subscribe(subscriber: ReferenceSandboxControlsSubscriber): () => void;
  dispose(): void;
}

interface ActivePointerDrag {
  readonly pointerId: number;
  clientX: number;
  clientY: number;
}

/**
 * Owns Sandbox-only camera state. Pointer movement and wheel zoom are
 * continuous presentation changes; only the explicit reset is a camera cut.
 */
export function createReferenceSandboxCameraController(
  camera: PerspectiveCamera,
  options: ReferenceSandboxCameraControllerOptions = {},
): ReferenceSandboxCameraController {
  assertPerspectiveCamera(camera);
  const resetCandidate: ReferenceSandboxCameraKeyframe =
    options.resetKeyframe ?? {
      position: [camera.position.x, camera.position.y, camera.position.z],
      target: DEFAULT_TARGET,
      verticalFovDegrees: camera.fov,
    };
  assertKeyframe(resetCandidate, "Sandbox camera reset keyframe");
  const resetKeyframe = freezeKeyframe(resetCandidate);
  let target = vectorFromTuple(resetKeyframe.target);
  assertFiniteVector(camera.position, "Sandbox camera position");
  assertFov(camera.fov, "Sandbox camera FOV");
  assertCameraOffset(camera.position, target);
  let activeDrag: ActivePointerDrag | undefined;

  const applyCamera = (position: Vector3, fov: number): void => {
    assertFiniteVector(position, "Sandbox camera position");
    assertFov(fov, "Sandbox camera FOV");
    const distance = position.distanceTo(target);
    if (distance < MIN_CAMERA_DISTANCE || distance > MAX_CAMERA_DISTANCE) {
      throw new RangeError(
        `Sandbox camera distance must be between ${MIN_CAMERA_DISTANCE} and ${MAX_CAMERA_DISTANCE} metres.`,
      );
    }
    camera.position.copy(position);
    camera.fov = fov;
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  };

  const orbitByPixels = (deltaX: number, deltaY: number): void => {
    assertFinite(deltaX, "Sandbox camera horizontal pointer delta");
    assertFinite(deltaY, "Sandbox camera vertical pointer delta");
    const offset = camera.position.clone().sub(target);
    const distance = offset.length();
    assertCameraDistance(distance);
    const azimuth =
      Math.atan2(offset.x, offset.z) - deltaX * ORBIT_RADIANS_PER_PIXEL;
    const polar = clamp(
      Math.acos(clamp(offset.y / distance, -1, 1)) +
        deltaY * ORBIT_RADIANS_PER_PIXEL,
      MIN_POLAR_ANGLE_RADIANS,
      MAX_POLAR_ANGLE_RADIANS,
    );
    const sinPolar = Math.sin(polar);
    applyCamera(
      new Vector3(
        target.x + distance * sinPolar * Math.sin(azimuth),
        target.y + distance * Math.cos(polar),
        target.z + distance * sinPolar * Math.cos(azimuth),
      ),
      camera.fov,
    );
  };

  return Object.freeze({
    beginPointerDrag(
      pointerId: number,
      clientX: number,
      clientY: number,
    ): void {
      assertPointerSample(pointerId, clientX, clientY);
      activeDrag = { pointerId, clientX, clientY };
    },
    movePointerDrag(pointerId: number, clientX: number, clientY: number): void {
      assertPointerSample(pointerId, clientX, clientY);
      if (activeDrag?.pointerId !== pointerId) {
        return;
      }
      const deltaX = clientX - activeDrag.clientX;
      const deltaY = clientY - activeDrag.clientY;
      activeDrag.clientX = clientX;
      activeDrag.clientY = clientY;
      orbitByPixels(deltaX, deltaY);
    },
    endPointerDrag(pointerId: number): void {
      assertFinite(pointerId, "Sandbox camera pointer id");
      if (activeDrag?.pointerId === pointerId) {
        activeDrag = undefined;
      }
    },
    zoomByWheelDelta(deltaY: number): void {
      assertFinite(deltaY, "Sandbox camera wheel delta");
      const offset = camera.position.clone().sub(target);
      const distance = offset.length();
      assertCameraDistance(distance);
      const nextDistance = clamp(
        distance * Math.exp(deltaY * ZOOM_EXPONENT_PER_PIXEL),
        MIN_ZOOM_DISTANCE,
        MAX_ZOOM_DISTANCE,
      );
      applyCamera(
        target.clone().add(offset.multiplyScalar(nextDistance / distance)),
        camera.fov,
      );
    },
    reset(): void {
      activeDrag = undefined;
      target = vectorFromTuple(resetKeyframe.target);
      applyCamera(
        vectorFromTuple(resetKeyframe.position),
        resetKeyframe.verticalFovDegrees,
      );
      options.onCameraCut?.();
    },
    inspect(): ReferenceSandboxCameraSnapshot {
      return freezeSnapshot(camera, target);
    },
  });
}

/**
 * Binds the manual Sandbox's desktop input to one ready-stage lifetime. It
 * deliberately owns no clock or frame scheduling; the host's fixed-step route
 * consumes the resulting vessel controls.
 */
export function createReferenceSandboxControls(
  options: ReferenceSandboxControlsOptions,
): ReferenceSandboxControls {
  if (
    options === undefined ||
    options.vessel === undefined ||
    typeof options.vessel.setControls !== "function"
  ) {
    throw new TypeError("Sandbox controls require a Reference proxy vessel.");
  }
  if (
    options.camera === undefined ||
    typeof options.camera.inspect !== "function" ||
    typeof options.camera.beginPointerDrag !== "function" ||
    typeof options.camera.movePointerDrag !== "function" ||
    typeof options.camera.endPointerDrag !== "function" ||
    typeof options.camera.zoomByWheelDelta !== "function" ||
    typeof options.camera.reset !== "function"
  ) {
    throw new TypeError("Sandbox controls require a camera controller.");
  }
  const eventTarget = options.eventTarget ?? defaultEventTarget();
  const documentTarget = options.documentTarget ?? defaultDocumentTarget();
  const subscribers = new Set<ReferenceSandboxControlsSubscriber>();
  const heldKeys = new Set<string>();
  const acceptedKeys = new Set([
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "KeyW",
    "KeyA",
    "KeyS",
    "KeyD",
  ]);
  let enabled = false;
  let disposed = false;
  let activePointerId: number | undefined;
  let attachment:
    | {
        readonly stage: HTMLElement;
        readonly canvas: HTMLCanvasElement;
        readonly previousStageDecoration: string | undefined;
        readonly previousCanvasDecoration: string | undefined;
        disposed: boolean;
      }
    | undefined;

  const snapshot = (): ReferenceSandboxControlsSnapshot =>
    Object.freeze({
      enabled,
      attached: attachment !== undefined && !attachment.disposed,
      heldKeys: Object.freeze([...heldKeys].sort()),
      camera: options.camera.inspect(),
    });
  const notifySubscribers = (): void => {
    const current = snapshot();
    for (const subscriber of subscribers) {
      subscriber(current);
    }
  };
  const applyVesselControls = (): void => {
    options.vessel.setControls({
      throttle:
        Number(heldKeys.has("ArrowUp") || heldKeys.has("KeyW")) -
        Number(heldKeys.has("ArrowDown") || heldKeys.has("KeyS")),
      steering:
        Number(heldKeys.has("ArrowLeft") || heldKeys.has("KeyA")) -
        Number(heldKeys.has("ArrowRight") || heldKeys.has("KeyD")),
    });
  };
  const clearInputState = (): void => {
    heldKeys.clear();
    if (activePointerId !== undefined) {
      releasePointerCapture(attachment?.canvas, activePointerId);
      options.camera.endPointerDrag(activePointerId);
      activePointerId = undefined;
    }
    applyVesselControls();
  };
  const decorateAttachment = (): void => {
    if (attachment === undefined || attachment.disposed) {
      return;
    }
    const value = enabled ? "enabled" : "disabled";
    attachment.stage.dataset.sandboxControls = value;
    attachment.canvas.dataset.sandboxControls = value;
  };
  const onKeyDown: EventListener = (rawEvent): void => {
    const event = rawEvent as KeyboardEvent;
    if (
      !enabled ||
      !acceptedKeys.has(event.code) ||
      event.repeat ||
      isEditableKeyboardTarget(event.target)
    ) {
      return;
    }
    event.preventDefault();
    if (heldKeys.has(event.code)) {
      return;
    }
    heldKeys.add(event.code);
    applyVesselControls();
    notifySubscribers();
  };
  const onKeyUp: EventListener = (rawEvent): void => {
    const event = rawEvent as KeyboardEvent;
    if (!acceptedKeys.has(event.code)) {
      return;
    }
    const changed = heldKeys.delete(event.code);
    if (enabled && changed) {
      event.preventDefault();
      applyVesselControls();
      notifySubscribers();
    }
  };
  const onBlur: EventListener = (): void => {
    if (!enabled) {
      return;
    }
    clearInputState();
    notifySubscribers();
  };
  const onVisibilityChange: EventListener = (): void => {
    if (
      !enabled ||
      (!documentTarget.hidden && documentTarget.visibilityState !== "hidden")
    ) {
      return;
    }
    clearInputState();
    notifySubscribers();
  };
  const onPointerDown: EventListener = (rawEvent): void => {
    const event = rawEvent as PointerEvent;
    if (!enabled || event.button !== 0 || activePointerId !== undefined) {
      return;
    }
    options.camera.beginPointerDrag(
      event.pointerId,
      event.clientX,
      event.clientY,
    );
    activePointerId = event.pointerId;
    setPointerCapture(attachment?.canvas, event.pointerId);
    event.preventDefault();
  };
  const onPointerMove: EventListener = (rawEvent): void => {
    const event = rawEvent as PointerEvent;
    if (!enabled || activePointerId !== event.pointerId) {
      return;
    }
    options.camera.movePointerDrag(
      event.pointerId,
      event.clientX,
      event.clientY,
    );
    event.preventDefault();
    notifySubscribers();
  };
  const onPointerEnd: EventListener = (rawEvent): void => {
    const event = rawEvent as PointerEvent;
    if (activePointerId !== event.pointerId) {
      return;
    }
    options.camera.endPointerDrag(event.pointerId);
    activePointerId = undefined;
    releasePointerCapture(attachment?.canvas, event.pointerId);
    if (enabled) {
      event.preventDefault();
    }
  };
  const onWheel: EventListener = (rawEvent): void => {
    const event = rawEvent as WheelEvent;
    if (!enabled) {
      return;
    }
    options.camera.zoomByWheelDelta(event.deltaY);
    event.preventDefault();
    notifySubscribers();
  };
  const detach = (record: NonNullable<typeof attachment>): void => {
    if (record.disposed) {
      return;
    }
    record.disposed = true;
    eventTarget.removeEventListener("keydown", onKeyDown);
    eventTarget.removeEventListener("keyup", onKeyUp);
    eventTarget.removeEventListener("blur", onBlur);
    documentTarget.removeEventListener("visibilitychange", onVisibilityChange);
    record.canvas.removeEventListener("pointerdown", onPointerDown);
    record.canvas.removeEventListener("wheel", onWheel);
    eventTarget.removeEventListener("pointermove", onPointerMove);
    eventTarget.removeEventListener("pointerup", onPointerEnd);
    eventTarget.removeEventListener("pointercancel", onPointerEnd);
    restoreSandboxDecoration(
      record.stage.dataset,
      record.previousStageDecoration,
    );
    restoreSandboxDecoration(
      record.canvas.dataset,
      record.previousCanvasDecoration,
    );
    clearInputState();
    if (attachment === record) {
      attachment = undefined;
    }
    notifySubscribers();
  };

  return Object.freeze({
    attach(
      stage: HTMLElement,
      canvas: HTMLCanvasElement,
    ): ReferenceSandboxControlsAttachment {
      assertUsable(disposed);
      if (attachment !== undefined && !attachment.disposed) {
        throw new Error(
          "Sandbox controls are already attached to a ready stage.",
        );
      }
      if (stage === undefined || canvas === undefined) {
        throw new TypeError(
          "Sandbox controls require a ready stage and canvas.",
        );
      }
      const record = {
        stage,
        canvas,
        previousStageDecoration: stage.dataset.sandboxControls,
        previousCanvasDecoration: canvas.dataset.sandboxControls,
        disposed: false,
      };
      attachment = record;
      decorateAttachment();
      eventTarget.addEventListener("keydown", onKeyDown);
      eventTarget.addEventListener("keyup", onKeyUp);
      eventTarget.addEventListener("blur", onBlur);
      documentTarget.addEventListener("visibilitychange", onVisibilityChange);
      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("wheel", onWheel, { passive: false });
      eventTarget.addEventListener("pointermove", onPointerMove);
      eventTarget.addEventListener("pointerup", onPointerEnd);
      eventTarget.addEventListener("pointercancel", onPointerEnd);
      notifySubscribers();
      return Object.freeze({
        dispose(): void {
          detach(record);
        },
      });
    },
    setEnabled(nextEnabled: boolean): void {
      assertUsable(disposed);
      if (typeof nextEnabled !== "boolean") {
        throw new TypeError("Sandbox controls enabled state must be boolean.");
      }
      if (enabled === nextEnabled) {
        if (!nextEnabled) {
          clearInputState();
        }
        return;
      }
      enabled = nextEnabled;
      if (!enabled) {
        clearInputState();
      }
      decorateAttachment();
      notifySubscribers();
    },
    resetCamera(): void {
      assertUsable(disposed);
      options.camera.reset();
      notifySubscribers();
    },
    snapshot,
    subscribe(subscriber: ReferenceSandboxControlsSubscriber): () => void {
      assertUsable(disposed);
      subscribers.add(subscriber);
      subscriber(snapshot());
      let unsubscribed = false;
      return (): void => {
        if (unsubscribed) {
          return;
        }
        unsubscribed = true;
        subscribers.delete(subscriber);
      };
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      enabled = false;
      if (attachment !== undefined) {
        detach(attachment);
      } else {
        clearInputState();
      }
      disposed = true;
      subscribers.clear();
    },
  });
}

function assertPerspectiveCamera(camera: PerspectiveCamera): void {
  if (camera?.isPerspectiveCamera !== true) {
    throw new TypeError("Sandbox camera controls require a PerspectiveCamera.");
  }
}

function assertKeyframe(
  keyframe: ReferenceSandboxCameraKeyframe,
  label: string,
): void {
  assertTuple(keyframe.position, `${label} position`);
  assertTuple(keyframe.target, `${label} target`);
  assertFov(keyframe.verticalFovDegrees, `${label} FOV`);
  assertCameraOffset(
    vectorFromTuple(keyframe.position),
    vectorFromTuple(keyframe.target),
  );
}

function assertCameraOffset(position: Vector3, target: Vector3): void {
  const offset = position.clone().sub(target);
  const distance = offset.length();
  assertCameraDistance(distance);
  const polar = Math.acos(clamp(offset.y / distance, -1, 1));
  if (polar < MIN_POLAR_ANGLE_RADIANS || polar > MAX_POLAR_ANGLE_RADIANS) {
    throw new RangeError(
      "Sandbox camera pitch must remain between -85 and 85 degrees.",
    );
  }
}

function assertPointerSample(
  pointerId: number,
  clientX: number,
  clientY: number,
): void {
  assertFinite(pointerId, "Sandbox camera pointer id");
  assertFinite(clientX, "Sandbox camera pointer x");
  assertFinite(clientY, "Sandbox camera pointer y");
}

function assertTuple(
  value: readonly [number, number, number],
  label: string,
): void {
  if (value.length !== 3 || !value.every(Number.isFinite)) {
    throw new RangeError(`${label} must contain three finite values.`);
  }
}

function assertFiniteVector(vector: Vector3, label: string): void {
  if (![vector.x, vector.y, vector.z].every(Number.isFinite)) {
    throw new RangeError(`${label} must contain finite values.`);
  }
}

function assertCameraDistance(distance: number): void {
  if (
    !Number.isFinite(distance) ||
    distance < MIN_CAMERA_DISTANCE ||
    distance > MAX_CAMERA_DISTANCE
  ) {
    throw new RangeError(
      `Sandbox camera distance must be between ${MIN_CAMERA_DISTANCE} and ${MAX_CAMERA_DISTANCE} metres.`,
    );
  }
}

function assertFov(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0 || value >= 180) {
    throw new RangeError(`${label} must be greater than 0 and less than 180.`);
  }
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be finite.`);
  }
}

function freezeKeyframe(
  keyframe: ReferenceSandboxCameraKeyframe,
): ReferenceSandboxCameraKeyframe {
  return Object.freeze({
    position: freezeTuple(keyframe.position),
    target: freezeTuple(keyframe.target),
    verticalFovDegrees: keyframe.verticalFovDegrees,
  });
}

function freezeSnapshot(
  camera: PerspectiveCamera,
  target: Vector3,
): ReferenceSandboxCameraSnapshot {
  const position = freezeTuple([
    camera.position.x,
    camera.position.y,
    camera.position.z,
  ]);
  return Object.freeze({
    position,
    target: freezeTuple([target.x, target.y, target.z]),
    verticalFovDegrees: camera.fov,
    distance: Math.hypot(
      position[0] - target.x,
      position[1] - target.y,
      position[2] - target.z,
    ),
  });
}

function freezeTuple(
  value: readonly [number, number, number],
): readonly [number, number, number] {
  return Object.freeze([value[0], value[1], value[2]]);
}

function vectorFromTuple(value: readonly [number, number, number]): Vector3 {
  return new Vector3(value[0], value[1], value[2]);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function defaultEventTarget(): ReferenceSandboxListenerTarget {
  if (typeof window === "undefined") {
    throw new Error(
      "Sandbox controls require an injected eventTarget outside a browser.",
    );
  }
  return window;
}

function defaultDocumentTarget(): ReferenceSandboxDocumentTarget {
  if (typeof document === "undefined") {
    throw new Error(
      "Sandbox controls require an injected documentTarget outside a browser.",
    );
  }
  return document;
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  const closest = (target as { closest?: (selector: string) => unknown } | null)
    ?.closest;
  return (
    typeof closest === "function" &&
    closest.call(
      target,
      "input, select, textarea, button, [contenteditable='true'], [contenteditable='']",
    ) !== null
  );
}

function restoreSandboxDecoration(
  dataset: DOMStringMap,
  previousValue: string | undefined,
): void {
  if (previousValue === undefined) {
    delete dataset.sandboxControls;
  } else {
    dataset.sandboxControls = previousValue;
  }
}

function setPointerCapture(
  canvas: HTMLCanvasElement | undefined,
  pointerId: number,
): void {
  const capture = (
    canvas as
      | (HTMLCanvasElement & {
          setPointerCapture?: (id: number) => void;
        })
      | undefined
  )?.setPointerCapture;
  if (typeof capture === "function") {
    capture.call(canvas, pointerId);
  }
}

function releasePointerCapture(
  canvas: HTMLCanvasElement | undefined,
  pointerId: number,
): void {
  const hasCapture = (
    canvas as
      | (HTMLCanvasElement & {
          hasPointerCapture?: (id: number) => boolean;
        })
      | undefined
  )?.hasPointerCapture;
  if (typeof hasCapture === "function" && !hasCapture.call(canvas, pointerId)) {
    return;
  }
  const releaser = (
    canvas as
      | (HTMLCanvasElement & {
          releasePointerCapture?: (id: number) => void;
        })
      | undefined
  )?.releasePointerCapture;
  if (typeof releaser === "function") {
    releaser.call(canvas, pointerId);
  }
}

function assertUsable(disposed: boolean): void {
  if (disposed) {
    throw new Error("Sandbox controls have been disposed.");
  }
}
