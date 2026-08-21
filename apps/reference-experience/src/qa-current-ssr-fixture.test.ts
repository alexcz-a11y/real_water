import { describe, expect, it } from "vitest";
import { Mesh, PerspectiveCamera, type MeshBasicMaterial } from "three";
import {
  QA_CURRENT_SSR_FIXTURE_BOUNDS,
  QA_CURRENT_SSR_FIXTURE_NAME,
  applyQaCurrentSsrFixtureEnabled,
  applyQaCurrentSsrFixtureHotColor,
  createQaCurrentSsrFixture,
  disposeQaCurrentSsrFixture,
  readQaCurrentSsrFixture,
} from "./qa-current-ssr-fixture.js";

describe("QA current-frame SSR fixture", () => {
  it("pins the FrontSide wall bounds used by hit-UV reconstruction", () => {
    expect(QA_CURRENT_SSR_FIXTURE_BOUNDS).toEqual({
      farWallZ: -8,
      nearWallZ: 240,
      halfWidth: 32,
      minY: -4,
      maxY: 44,
    });
  });

  it("stays visible and unculled while scale disables pixel output", () => {
    const fixture = createQaCurrentSsrFixture();
    expect(fixture.name).toBe(QA_CURRENT_SSR_FIXTURE_NAME);
    expect(readQaCurrentSsrFixture(fixture)).toEqual({
      visible: true,
      frustumCulled: false,
      enabled: false,
      scale: [0, 0, 0],
      hotColor: "magenta",
      colorWrite: true,
      depthWrite: true,
    });
    applyQaCurrentSsrFixtureEnabled(fixture, true);
    expect(readQaCurrentSsrFixture(fixture)).toEqual({
      visible: true,
      frustumCulled: false,
      enabled: true,
      scale: [1, 1, 1],
      hotColor: "magenta",
      colorWrite: true,
      depthWrite: true,
    });
    applyQaCurrentSsrFixtureEnabled(fixture, false);
    expect(readQaCurrentSsrFixture(fixture).visible).toBe(true);
    expect(readQaCurrentSsrFixture(fixture).frustumCulled).toBe(false);
    expect(readQaCurrentSsrFixture(fixture).enabled).toBe(false);
    disposeQaCurrentSsrFixture(fixture);
  });

  it("changes hot color on the same material without hiding the mesh", () => {
    const fixture = createQaCurrentSsrFixture();
    const material = fixture.material as MeshBasicMaterial;
    applyQaCurrentSsrFixtureHotColor(fixture, "black");
    expect(fixture.material).toBe(material);
    expect(readQaCurrentSsrFixture(fixture)).toMatchObject({
      visible: true,
      frustumCulled: false,
      enabled: false,
      hotColor: "black",
      colorWrite: true,
      depthWrite: true,
    });
    applyQaCurrentSsrFixtureEnabled(fixture, true);
    applyQaCurrentSsrFixtureHotColor(fixture, "magenta");
    expect(fixture.material).toBe(material);
    expect(readQaCurrentSsrFixture(fixture).hotColor).toBe("magenta");
    disposeQaCurrentSsrFixture(fixture);
  });

  it("disposes geometry and material exactly once through the fixture seam", () => {
    const fixture = createQaCurrentSsrFixture();
    const geometryDispose = fixture.geometry.dispose.bind(fixture.geometry);
    const material = fixture.material as MeshBasicMaterial;
    const materialDispose = material.dispose.bind(material);
    let geometryCount = 0;
    let materialCount = 0;
    fixture.geometry.dispose = () => {
      geometryCount += 1;
      geometryDispose();
    };
    material.dispose = () => {
      materialCount += 1;
      materialDispose();
    };
    disposeQaCurrentSsrFixture(fixture);
    expect(geometryCount).toBe(1);
    expect(materialCount).toBe(1);
    expect(fixture.parent).toBeNull();
  });

  it("keeps the FrontSide wall in the main camera and out of a below-water planar camera", () => {
    const fixture = createQaCurrentSsrFixture();
    const material = fixture.material as MeshBasicMaterial;
    applyQaCurrentSsrFixtureEnabled(fixture, true);
    const main = new PerspectiveCamera();
    main.position.set(0, 12, 20);
    const planar = new PerspectiveCamera();
    planar.position.set(0, -12, 20);
    const before = fixture.onBeforeRender as (
      renderer: unknown,
      scene: unknown,
      camera: PerspectiveCamera,
    ) => void;
    const after = fixture.onAfterRender as (
      renderer: unknown,
      scene: unknown,
      camera: PerspectiveCamera,
    ) => void;
    before({}, {}, planar);
    expect(material.colorWrite).toBe(false);
    expect(material.depthWrite).toBe(false);
    expect(readQaCurrentSsrFixture(fixture).enabled).toBe(true);
    after({}, {}, planar);
    expect(material.colorWrite).toBe(true);
    expect(material.depthWrite).toBe(true);
    before({}, {}, main);
    expect(material.colorWrite).toBe(true);
    expect(material.depthWrite).toBe(true);
    after({}, {}, main);
    expect(readQaCurrentSsrFixture(fixture).enabled).toBe(true);
    disposeQaCurrentSsrFixture(fixture);
  });

  it("keeps main-camera writes enabled while scale disables the fixture", () => {
    const fixture = createQaCurrentSsrFixture();
    const material = fixture.material as MeshBasicMaterial;
    expect(readQaCurrentSsrFixture(fixture)).toMatchObject({
      enabled: false,
      scale: [0, 0, 0],
      colorWrite: true,
      depthWrite: true,
    });
    const main = new PerspectiveCamera();
    main.position.set(0, 12, 20);
    const planar = new PerspectiveCamera();
    planar.position.set(0, -12, 20);
    const before = fixture.onBeforeRender as (
      renderer: unknown,
      scene: unknown,
      camera: PerspectiveCamera,
    ) => void;
    const after = fixture.onAfterRender as (
      renderer: unknown,
      scene: unknown,
      camera: PerspectiveCamera,
    ) => void;
    before({}, {}, planar);
    expect(material.colorWrite).toBe(false);
    expect(material.depthWrite).toBe(false);
    expect(fixture.scale.toArray()).toEqual([0, 0, 0]);
    after({}, {}, planar);
    expect(material.colorWrite).toBe(true);
    expect(material.depthWrite).toBe(true);
    before({}, {}, main);
    expect(material.colorWrite).toBe(true);
    expect(material.depthWrite).toBe(true);
    expect(readQaCurrentSsrFixture(fixture).enabled).toBe(false);
    disposeQaCurrentSsrFixture(fixture);
  });

  it("rejects a generic mesh so callers cannot hide the FrontSide fixture", () => {
    expect(() =>
      applyQaCurrentSsrFixtureEnabled(new Mesh(), false),
    ).toThrowError(/named FrontSide Mesh/i);
  });
});
