import type { OpenWaterRuntimeSnapshot } from "../runtime.js";
import type {
  HostPresentationRoute,
  HostPresentedFrame,
} from "../presentation.js";
import type { HostPreparedLease } from "../startup.js";
import {
  getHostDiagnosticsImplementation,
  installHostDiagnosticsRoute,
} from "./diagnostics-route-bridge.js";

export const HOST_PRESENTATION_ROUTE_BRIDGE = Symbol(
  "real-water/host-presentation-route-bridge",
);

export interface HostPresentationRouteBridge {
  connect(
    inspectRuntime: () => OpenWaterRuntimeSnapshot,
  ): HostPresentationRoute;
  activate(): void;
  unbind(): void;
  drain(): Promise<void>;
}

export type HostPreparedPresentationLease = HostPreparedLease &
  Readonly<{
    [HOST_PRESENTATION_ROUTE_BRIDGE]?: HostPresentationRouteBridge;
  }>;

export interface PresentationBindSession {
  readonly route: HostPresentationRoute;
  readonly presentedDuringBind: boolean;
  activate(): void;
}

export function createPresentationBindSession(
  route: HostPresentationRoute,
): PresentationBindSession {
  let phase: "binding" | "active" = "binding";
  let presentedDuringBind = false;
  const guardPresent = (): void => {
    if (phase === "binding") {
      presentedDuringBind = true;
      throw new Error("Host Presentation bind must not call present().");
    }
    if (phase !== "active") {
      throw new Error("The Host Presentation Route is not active.");
    }
  };
  const wrapper: HostPresentationRoute = {
    present() {
      guardPresent();
      return route.present();
    },
  };
  const diagnostics = getHostDiagnosticsImplementation(route);
  if (diagnostics !== undefined) {
    installHostDiagnosticsRoute(wrapper, {
      present(request) {
        guardPresent();
        return diagnostics.present(request);
      },
    });
  }
  return {
    route: Object.freeze(wrapper),
    get presentedDuringBind() {
      return presentedDuringBind;
    },
    activate() {
      phase = "active";
    },
  };
}

export function connectPreparedPresentationRoute(
  lease: HostPreparedLease,
  inspectRuntime: () => OpenWaterRuntimeSnapshot,
): HostPresentationRoute {
  const bridge = (lease as HostPreparedPresentationLease)[
    HOST_PRESENTATION_ROUTE_BRIDGE
  ];
  if (bridge !== undefined) {
    return bridge.connect(inspectRuntime);
  }
  return createUnavailableHostPresentationRoute();
}

export function activatePreparedPresentationRoute(
  lease: HostPreparedLease,
): void {
  (lease as HostPreparedPresentationLease)[
    HOST_PRESENTATION_ROUTE_BRIDGE
  ]?.activate();
}

export function unbindPreparedPresentationRoute(
  lease: HostPreparedLease,
): void {
  (lease as HostPreparedPresentationLease)[
    HOST_PRESENTATION_ROUTE_BRIDGE
  ]?.unbind();
}

function createUnavailableHostPresentationRoute(): HostPresentationRoute {
  return Object.freeze({
    async present(): Promise<HostPresentedFrame> {
      throw new Error(
        "This Host Prepared Lease has no Core presentation route.",
      );
    },
  });
}
