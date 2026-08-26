import { PerspectiveCamera, Scene } from "three";
import { describe, expect, it, vi } from "vitest";
import { createReferenceProxyVessel } from "./reference-proxy-vessel.js";
import {
  createReferenceSandboxCameraController,
  createReferenceSandboxControls,
} from "./reference-sandbox-controls.js";

describe("Reference Sandbox camera controls", () => {
  it("restores its explicit reset keyframe and reports one camera cut", () => {
    const camera = new PerspectiveCamera(52, 16 / 9, 0.1, 4_000);
    camera.position.set(8, 6, 10);
    camera.lookAt(1, 2, -3);
    camera.updateMatrixWorld(true);
    const onCameraCut = vi.fn();
    const controls = createReferenceSandboxCameraController(camera, {
      onCameraCut,
      resetKeyframe: {
        position: [8, 6, 10],
        target: [1, 2, -3],
        verticalFovDegrees: 52,
      },
    });
    const resetKeyframe = controls.inspect();

    controls.beginPointerDrag(1, 100, 100);
    controls.movePointerDrag(1, 160, 135);
    controls.endPointerDrag(1);
    controls.zoomByWheelDelta(-120);
    expect(controls.inspect()).not.toEqual(resetKeyframe);

    controls.reset();

    expect(controls.inspect()).toEqual(resetKeyframe);
    expect(controls.inspect().target).toEqual([1, 2, -3]);
    expect(camera.position.toArray()).toEqual([8, 6, 10]);
    expect(camera.fov).toBe(52);
    expect(onCameraCut).toHaveBeenCalledTimes(1);
  });

  it("keeps continuous orbit and zoom finite, bounded, and cut-free", () => {
    const camera = new PerspectiveCamera(45, 1, 0.1, 4_000);
    camera.position.set(10, 8, 12);
    camera.lookAt(2, 1, -3);
    camera.updateMatrixWorld(true);
    const onCameraCut = vi.fn();
    const controls = createReferenceSandboxCameraController(camera, {
      onCameraCut,
      resetKeyframe: {
        position: [10, 8, 12],
        target: [2, 1, -3],
        verticalFovDegrees: 45,
      },
    });

    controls.beginPointerDrag(4, 0, 0);
    controls.movePointerDrag(4, 720, -1_000_000);
    controls.endPointerDrag(4);
    controls.zoomByWheelDelta(1_000_000);
    controls.zoomByWheelDelta(-1_000_000);

    const snapshot = controls.inspect();
    expect(snapshot.position.every(Number.isFinite)).toBe(true);
    expect(snapshot.target).toEqual([2, 1, -3]);
    expect(snapshot.distance).toBeGreaterThanOrEqual(0.5);
    expect(snapshot.distance).toBeLessThanOrEqual(4_000);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.position)).toBe(true);
    expect(Object.isFrozen(snapshot.target)).toBe(true);
    expect(onCameraCut).not.toHaveBeenCalled();
  });

  it("rejects non-finite and invalid camera construction inputs", () => {
    const camera = new PerspectiveCamera(50, 1, 0.1, 4_000);
    camera.position.set(0, 0, 10);

    expect(() =>
      createReferenceSandboxCameraController(camera, {
        resetKeyframe: {
          position: [0, 0, 0],
          target: [0, 0, 0],
          verticalFovDegrees: 50,
        },
      }),
    ).toThrow(/distance/);
    expect(() =>
      createReferenceSandboxCameraController(camera, {
        resetKeyframe: {
          position: [0, 0, 10],
          target: [0, Number.NaN, 0],
          verticalFovDegrees: 50,
        },
      }),
    ).toThrow(/finite/);
    expect(() =>
      createReferenceSandboxCameraController(camera, {
        resetKeyframe: {
          position: [0, 0, 10],
          target: [0, 0, 0],
          verticalFovDegrees: 180,
        },
      }),
    ).toThrow(/less than 180/);
    expect(() =>
      createReferenceSandboxCameraController(camera, {
        resetKeyframe: {
          position: [0, 10, 0],
          target: [0, 0, 0],
          verticalFovDegrees: 50,
        },
      }),
    ).toThrow(/pitch/);

    const controls = createReferenceSandboxCameraController(camera);
    expect(() => controls.zoomByWheelDelta(Number.NaN)).toThrow(/finite/);
    expect(() =>
      controls.beginPointerDrag(1, Number.POSITIVE_INFINITY, 0),
    ).toThrow(/finite/);
  });
});

describe("Reference Sandbox desktop input", () => {
  it("combines held vessel keys while isolating editable focus and repeats", () => {
    const fixture = createInputFixture();
    const controls = createReferenceSandboxControls({
      vessel: fixture.vessel,
      camera: fixture.cameraController,
      eventTarget: fixture.events,
      documentTarget: fixture.document,
    });
    controls.attach(fixture.stage, fixture.canvas);
    controls.setEnabled(true);
    const subscriber = vi.fn();
    controls.subscribe(subscriber);

    fixture.events.emit("keydown", keyboardEvent("KeyW"));
    fixture.events.emit("keydown", keyboardEvent("ArrowLeft"));
    expect(fixture.lastVesselControls()).toEqual({
      throttle: 1,
      steering: 1,
    });

    fixture.events.emit("keydown", keyboardEvent("KeyS"));
    expect(fixture.lastVesselControls()).toEqual({
      throttle: 0,
      steering: 1,
    });
    fixture.events.emit("keyup", keyboardEvent("KeyS"));
    expect(fixture.lastVesselControls()).toEqual({
      throttle: 1,
      steering: 1,
    });

    const notificationCount = subscriber.mock.calls.length;
    fixture.events.emit("keydown", keyboardEvent("KeyW", { repeat: true }));
    for (const editable of [
      "input",
      "select",
      "textarea",
      "button",
      "contenteditable",
    ]) {
      fixture.events.emit(
        "keydown",
        keyboardEvent("KeyD", { target: editableTarget(editable) }),
      );
    }
    expect(subscriber).toHaveBeenCalledTimes(notificationCount);

    fixture.events.emit(
      "keyup",
      keyboardEvent("KeyW", { target: editableTarget("textarea") }),
    );
    expect(fixture.lastVesselControls()).toEqual({
      throttle: 0,
      steering: 1,
    });
    controls.dispose();
    fixture.vessel.dispose();
  });

  it("orbits with primary drag and prevents wheel scrolling only when enabled", () => {
    const fixture = createInputFixture();
    const onCameraCut = vi.fn();
    const cameraController = createReferenceSandboxCameraController(
      fixture.camera,
      { onCameraCut },
    );
    const controls = createReferenceSandboxControls({
      vessel: fixture.vessel,
      camera: cameraController,
      eventTarget: fixture.events,
      documentTarget: fixture.document,
    });
    controls.attach(fixture.stage, fixture.canvas);
    const initial = cameraController.inspect();
    const disabledWheel = wheelEvent(-100);
    fixture.canvasTarget.emit("wheel", disabledWheel);
    fixture.canvasTarget.emit(
      "pointerdown",
      pointerEvent({ button: 0, pointerId: 7, clientX: 10, clientY: 10 }),
    );
    fixture.events.emit(
      "pointermove",
      pointerEvent({ button: 0, pointerId: 7, clientX: 90, clientY: 50 }),
    );
    expect(cameraController.inspect()).toEqual(initial);
    expect(disabledWheel.preventDefault).not.toHaveBeenCalled();

    controls.setEnabled(true);
    fixture.canvasTarget.emit(
      "pointerdown",
      pointerEvent({ button: 1, pointerId: 8, clientX: 10, clientY: 10 }),
    );
    fixture.events.emit(
      "pointermove",
      pointerEvent({ button: 1, pointerId: 8, clientX: 90, clientY: 50 }),
    );
    expect(cameraController.inspect()).toEqual(initial);

    fixture.canvasTarget.emit(
      "pointerdown",
      pointerEvent({ button: 0, pointerId: 9, clientX: 10, clientY: 10 }),
    );
    fixture.events.emit(
      "pointermove",
      pointerEvent({ button: 0, pointerId: 9, clientX: 90, clientY: 50 }),
    );
    const afterDrag = cameraController.inspect();
    expect(afterDrag).not.toEqual(initial);
    fixture.events.emit(
      "pointerup",
      pointerEvent({ button: 0, pointerId: 9, clientX: 90, clientY: 50 }),
    );
    fixture.events.emit(
      "pointermove",
      pointerEvent({ button: 0, pointerId: 9, clientX: 140, clientY: 80 }),
    );
    expect(cameraController.inspect()).toEqual(afterDrag);

    const wheel = wheelEvent(-100);
    fixture.canvasTarget.emit("wheel", wheel);
    expect(cameraController.inspect().distance).toBeLessThan(
      afterDrag.distance,
    );
    expect(wheel.preventDefault).toHaveBeenCalledTimes(1);
    expect(onCameraCut).not.toHaveBeenCalled();
    controls.dispose();
    fixture.vessel.dispose();
  });

  it("zeros held controls on blur, hidden state, disable, and disposal", () => {
    const fixture = createInputFixture();
    const controls = createReferenceSandboxControls({
      vessel: fixture.vessel,
      camera: fixture.cameraController,
      eventTarget: fixture.events,
      documentTarget: fixture.document,
    });
    const attachment = controls.attach(fixture.stage, fixture.canvas);
    controls.setEnabled(true);

    fixture.events.emit("keydown", keyboardEvent("KeyW"));
    fixture.events.emit("blur", plainEvent());
    expect(fixture.lastVesselControls()).toEqual({
      throttle: 0,
      steering: 0,
    });

    fixture.events.emit("keydown", keyboardEvent("KeyA"));
    fixture.document.hidden = true;
    fixture.document.visibilityState = "hidden";
    fixture.document.emit("visibilitychange", plainEvent());
    expect(fixture.lastVesselControls()).toEqual({
      throttle: 0,
      steering: 0,
    });

    fixture.document.hidden = false;
    fixture.document.visibilityState = "visible";
    fixture.events.emit("keydown", keyboardEvent("KeyS"));
    controls.setEnabled(false);
    expect(fixture.lastVesselControls()).toEqual({
      throttle: 0,
      steering: 0,
    });
    const disabledCamera = fixture.cameraController.inspect();
    fixture.events.emit("keydown", keyboardEvent("KeyD"));
    fixture.canvasTarget.emit("wheel", wheelEvent(-200));
    expect(fixture.lastVesselControls()).toEqual({
      throttle: 0,
      steering: 0,
    });
    expect(fixture.cameraController.inspect()).toEqual(disabledCamera);

    controls.setEnabled(true);
    fixture.events.emit("keydown", keyboardEvent("ArrowUp"));
    expect(fixture.stageTarget.dataset.sandboxControls).toBe("enabled");
    controls.dispose();
    controls.dispose();
    attachment.dispose();
    expect(fixture.lastVesselControls()).toEqual({
      throttle: 0,
      steering: 0,
    });
    expect(fixture.stageTarget.dataset.sandboxControls).toBeUndefined();
    expect(fixture.canvasTarget.dataset.sandboxControls).toBeUndefined();
    expect(fixture.events.listenerCount()).toBe(0);
    expect(fixture.document.listenerCount()).toBe(0);
    fixture.vessel.dispose();
  });

  it("publishes deeply frozen snapshots and validates lifecycle misuse", () => {
    const fixture = createInputFixture();
    const controls = createReferenceSandboxControls({
      vessel: fixture.vessel,
      camera: fixture.cameraController,
      eventTarget: fixture.events,
      documentTarget: fixture.document,
    });
    const subscriber = vi.fn();
    const unsubscribe = controls.subscribe(subscriber);
    controls.attach(fixture.stage, fixture.canvas);
    controls.setEnabled(true);
    fixture.events.emit("keydown", keyboardEvent("KeyW"));

    const snapshot = controls.snapshot();
    expect(snapshot).toMatchObject({
      enabled: true,
      attached: true,
      heldKeys: ["KeyW"],
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.heldKeys)).toBe(true);
    expect(Object.isFrozen(snapshot.camera)).toBe(true);
    expect(subscriber).toHaveBeenCalled();

    unsubscribe();
    unsubscribe();
    controls.dispose();
    expect(() => controls.setEnabled(true)).toThrow(/disposed/);
    expect(() => controls.attach(fixture.stage, fixture.canvas)).toThrow(
      /disposed/,
    );
    expect(() =>
      createReferenceSandboxControls(
        {} as Parameters<typeof createReferenceSandboxControls>[0],
      ),
    ).toThrow(/proxy vessel/);
    fixture.vessel.dispose();
  });
});

function createInputFixture() {
  const events = new FakeEventTarget();
  const document = new FakeDocumentTarget();
  const stage = new FakeElementTarget();
  const canvas = new FakeElementTarget();
  const vessel = createReferenceProxyVessel(new Scene());
  const camera = new PerspectiveCamera(50, 16 / 9, 0.1, 4_000);
  camera.position.set(8, 6, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const cameraController = createReferenceSandboxCameraController(camera);
  return {
    events,
    document,
    stage: stage as unknown as HTMLElement,
    stageTarget: stage,
    canvas: canvas as unknown as HTMLCanvasElement,
    canvasTarget: canvas,
    vessel,
    camera,
    cameraController,
    lastVesselControls(): unknown {
      return vessel.inspect().controls;
    },
  };
}

function plainEvent(): Event {
  return { target: null } as unknown as Event;
}

function pointerEvent(options: {
  readonly button: number;
  readonly pointerId: number;
  readonly clientX: number;
  readonly clientY: number;
}): PointerEvent {
  return {
    ...options,
    preventDefault: vi.fn(),
    target: null,
  } as unknown as PointerEvent;
}

function wheelEvent(deltaY: number): WheelEvent & {
  readonly preventDefault: ReturnType<typeof vi.fn>;
} {
  return {
    deltaY,
    preventDefault: vi.fn(),
    target: null,
  } as unknown as WheelEvent & {
    readonly preventDefault: ReturnType<typeof vi.fn>;
  };
}

function keyboardEvent(
  code: string,
  options: { readonly repeat?: boolean; readonly target?: EventTarget } = {},
): KeyboardEvent {
  return {
    code,
    preventDefault: vi.fn(),
    repeat: options.repeat ?? false,
    target: options.target ?? null,
  } as unknown as KeyboardEvent;
}

function editableTarget(tagName: string): EventTarget {
  return {
    closest(selector: string): object | null {
      return selector.includes(tagName) ? this : null;
    },
  } as unknown as EventTarget;
}

class FakeEventTarget {
  readonly listeners = new Map<
    string,
    Set<EventListenerOrEventListenerObject>
  >();

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
  ): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
  ): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string, event: Event): void {
    for (const listener of this.listeners.get(type) ?? []) {
      if (typeof listener === "function") {
        listener(event);
      } else {
        listener.handleEvent(event);
      }
    }
  }

  listenerCount(): number {
    let count = 0;
    for (const listeners of this.listeners.values()) {
      count += listeners.size;
    }
    return count;
  }
}

class FakeDocumentTarget extends FakeEventTarget {
  hidden = false;
  visibilityState: DocumentVisibilityState = "visible";
}

class FakeElementTarget extends FakeEventTarget {
  readonly dataset: DOMStringMap = {};
}
