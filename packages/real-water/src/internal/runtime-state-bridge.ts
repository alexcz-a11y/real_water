import type { HostPreparedLease } from "../startup.js";
import type { RuntimeStateSink } from "../runtime.js";

export const HOST_RUNTIME_STATE_BRIDGE = Symbol(
  "real-water/host-runtime-state-bridge",
);

export type HostPreparedRuntimeLease = HostPreparedLease &
  Readonly<{
    [HOST_RUNTIME_STATE_BRIDGE]?: RuntimeStateSink;
  }>;

export function runtimeStateSink(
  lease: HostPreparedLease,
): RuntimeStateSink | undefined {
  return (lease as HostPreparedRuntimeLease)[HOST_RUNTIME_STATE_BRIDGE];
}
