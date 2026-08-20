import { Buffer } from "node:buffer";
import { expect } from "@playwright/test";

export function decodeFloat32(encoded: string): number[] {
  const bytes = Buffer.from(encoded, "base64");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Array.from({ length: bytes.byteLength / 4 }, (_, index) =>
    view.getFloat32(index * 4, true),
  );
}

export function decodeUint8(encoded: string): Uint8Array {
  return Uint8Array.from(Buffer.from(encoded, "base64"));
}

export function meanAbsDifference(
  left: ArrayLike<number>,
  right: ArrayLike<number>,
): number {
  expect(left.length, "meanAbsDifference requires equal lengths").toBe(
    right.length,
  );
  if (left.length === 0) {
    return 0;
  }
  let total = 0;
  for (let index = 0; index < left.length; index += 1) {
    total += Math.abs((left[index] ?? 0) - (right[index] ?? 0));
  }
  return total / left.length;
}
