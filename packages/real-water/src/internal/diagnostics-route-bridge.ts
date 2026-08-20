import type { HostDiagnosticsRoute } from "../diagnostics.js";
import type { HostPresentationRoute } from "../presentation.js";

export const HOST_DIAGNOSTICS_ROUTE = Symbol(
  "real-water/host-diagnostics-route",
);

type DiagnosticsCapableRoute = HostPresentationRoute & {
  readonly [HOST_DIAGNOSTICS_ROUTE]?: HostDiagnosticsRoute;
};

export function getHostDiagnosticsImplementation(
  route: HostPresentationRoute,
): HostDiagnosticsRoute | undefined {
  return (route as DiagnosticsCapableRoute)[HOST_DIAGNOSTICS_ROUTE];
}

export function installHostDiagnosticsRoute(
  route: HostPresentationRoute,
  diagnostics: HostDiagnosticsRoute,
): HostPresentationRoute {
  Object.defineProperty(route, HOST_DIAGNOSTICS_ROUTE, {
    configurable: false,
    enumerable: false,
    value: diagnostics,
    writable: false,
  });
  return route;
}
