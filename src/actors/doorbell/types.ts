import type { DoorbellDiagnosticLevel } from "./enums";

export type DoorbellMessage =
  | {
      type: "set";
      ringing: boolean;
    }
  | {
      type: "status";
      ringing: boolean;
    }
  | {
      type: "ping";
    }
  | {
      type: "pong";
    }
  | {
      type: "diagnostic";
      level: DoorbellDiagnosticLevel;
      kind: string;
      message: string;
    };
