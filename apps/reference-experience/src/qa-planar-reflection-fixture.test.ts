import { describe, expect, it } from "vitest";
import { Mesh, type MeshBasicMaterial } from "three";
import {
  QA_PLANAR_REFLECTION_FIXTURE_NAME,
  applyQaPlanarReflectionFixtureEnabled,
  applyQaPlanarReflectionFixtureHotColor,
  createQaPlanarReflectionFixture,
  disposeQaPlanarReflectionFixture,
  readQaPlanarReflectionFixture,
} from "./qa-planar-reflection-fixture.js";

describe("QA planar reflection fixture", () => {
  it("stays visible and unculled while scale disables pixel output", () => {
    const fixture = createQaPlanarReflectionFixture();
    expect(fixture.name).toBe(QA_PLANAR_REFLECTION_FIXTURE_NAME);
    expect(readQaPlanarReflectionFixture(fixture)).toEqual({
      visible: true,
      frustumCulled: false,
      enabled: false,
      scale: [0, 0, 0],
      hotColor: "magenta",
    });
    applyQaPlanarReflectionFixtureEnabled(fixture, true);
    expect(readQaPlanarReflectionFixture(fixture)).toEqual({
      visible: true,
      frustumCulled: false,
      enabled: true,
      scale: [1, 1, 1],
      hotColor: "magenta",
    });
    applyQaPlanarReflectionFixtureEnabled(fixture, false);
    expect(readQaPlanarReflectionFixture(fixture).visible).toBe(true);
    expect(readQaPlanarReflectionFixture(fixture).frustumCulled).toBe(false);
    expect(readQaPlanarReflectionFixture(fixture).enabled).toBe(false);
    disposeQaPlanarReflectionFixture(fixture);
  });

  it("changes hot color on the same material without hiding the mesh", () => {
    const fixture = createQaPlanarReflectionFixture();
    const material = fixture.material as MeshBasicMaterial;
    applyQaPlanarReflectionFixtureHotColor(fixture, "black");
    expect(fixture.material).toBe(material);
    expect(readQaPlanarReflectionFixture(fixture)).toMatchObject({
      visible: true,
      frustumCulled: false,
      enabled: false,
      hotColor: "black",
    });
    applyQaPlanarReflectionFixtureEnabled(fixture, true);
    applyQaPlanarReflectionFixtureHotColor(fixture, "magenta");
    expect(fixture.material).toBe(material);
    expect(readQaPlanarReflectionFixture(fixture).hotColor).toBe("magenta");
    disposeQaPlanarReflectionFixture(fixture);
  });

  it("disposes geometry and material exactly once through the fixture seam", () => {
    const fixture = createQaPlanarReflectionFixture();
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
    disposeQaPlanarReflectionFixture(fixture);
    expect(geometryCount).toBe(1);
    expect(materialCount).toBe(1);
    expect(fixture.parent).toBeNull();
  });

  it("rejects a generic mesh so callers cannot hide the BackSide fixture", () => {
    expect(() =>
      applyQaPlanarReflectionFixtureEnabled(new Mesh(), false),
    ).toThrowError(/named BackSide Mesh/i);
  });
});
