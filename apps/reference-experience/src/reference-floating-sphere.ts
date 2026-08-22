import { Color, Mesh, MeshBasicMaterial, SphereGeometry } from "three";
import type { Scene } from "three";
import {
  createMemoryBodyPhysicsAdapter,
  type BodyAttachment,
  type MemoryBodyPhysicsAdapter,
  type RealWaterRuntime,
} from "real-water";

export const REFERENCE_FLOATING_SPHERE_NAME =
  "Reference floating sphere Body" as const;

export interface ReferenceFloatingSphere {
  readonly physics: MemoryBodyPhysicsAdapter;
  attach(runtime: Pick<RealWaterRuntime, "attachBody">): BodyAttachment;
  integrateFixedStep(): void;
  present(alpha: number): void;
  dispose(): void;
}

export function createReferenceFloatingSphere(
  scene: Scene,
): ReferenceFloatingSphere {
  const geometry = new SphereGeometry(0.5, 32, 16);
  const material = new MeshBasicMaterial({ color: new Color(0xffb15a) });
  const mesh = new Mesh(geometry, material);
  mesh.name = REFERENCE_FLOATING_SPHERE_NAME;
  const physics = createMemoryBodyPhysicsAdapter({
    initialState: {
      position: { x: 0, y: 0.4, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      linearVelocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 },
      mass: 1,
    },
  });
  let attachment: BodyAttachment | undefined;
  let disposed = false;
  scene.add(mesh);

  return Object.freeze({
    physics,
    attach(runtime: Pick<RealWaterRuntime, "attachBody">): BodyAttachment {
      if (disposed) {
        throw new Error("The Reference floating sphere has been disposed.");
      }
      if (attachment?.inspect().attached === true) {
        throw new Error("The Reference floating sphere is already attached.");
      }
      attachment = runtime.attachBody({
        physics,
        shape: { kind: "sphere", radius: 0.5 },
      });
      return attachment;
    },
    integrateFixedStep(): void {
      physics.integrateFixedStep();
    },
    present(alpha: number): void {
      const pose = physics.interpolate(alpha);
      mesh.position.set(pose.position.x, pose.position.y, pose.position.z);
      mesh.quaternion.set(
        pose.rotation.x,
        pose.rotation.y,
        pose.rotation.z,
        pose.rotation.w,
      );
      mesh.updateMatrixWorld();
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      attachment?.detach();
      attachment = undefined;
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
    },
  });
}
