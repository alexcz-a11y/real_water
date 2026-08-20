import { execFileSync } from "node:child_process";

export type HostPowerState = "ac" | "battery" | "unknown";

export interface HostPowerProfile {
  readonly powerState: HostPowerState;
  readonly lowPowerMode: 0 | 1 | null;
}

export function readHostPowerProfile(): HostPowerProfile {
  if (process.platform !== "darwin") {
    return { powerState: "unknown", lowPowerMode: null };
  }
  try {
    const battery = execFileSync("/usr/bin/pmset", ["-g", "batt"], {
      encoding: "utf8",
    });
    const settings = execFileSync("/usr/bin/pmset", ["-g"], {
      encoding: "utf8",
    });
    return {
      powerState: parsePowerState(`${battery}\n${settings}`),
      lowPowerMode: parseLowPowerMode(settings),
    };
  } catch {
    return { powerState: "unknown", lowPowerMode: null };
  }
}

export function powerProjectToken(profile: HostPowerProfile): string {
  if (profile.powerState === "unknown" || profile.lowPowerMode === null) {
    return "power-unknown";
  }
  return `${profile.powerState}-lowpowermode-${String(profile.lowPowerMode)}`;
}

export function isAdmittedPowerProfile(profile: HostPowerProfile): boolean {
  return profile.powerState === "ac" && profile.lowPowerMode === 0;
}

function parsePowerState(text: string): HostPowerState {
  if (/drawing from 'AC Power'/iu.test(text)) {
    return "ac";
  }
  if (/drawing from 'Battery Power'/iu.test(text)) {
    return "battery";
  }
  return "unknown";
}

function parseLowPowerMode(text: string): 0 | 1 | null {
  const match = /lowpowermode\s+(\d+)/iu.exec(text);
  if (match?.[1] === "0") {
    return 0;
  }
  if (match?.[1] === "1") {
    return 1;
  }
  return null;
}
