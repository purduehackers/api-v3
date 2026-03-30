import type { DoorbellDiagnosticLevel } from "./enums";
import type { DoorbellMessage } from "./types";

export class DoorbellError extends Error {
  toWSMessage(level: DoorbellDiagnosticLevel): DoorbellMessage {
    return {
      type: "diagnostic",
      level,
      kind: this.name,
      message: this.message,
    };
  }
}

export class NoClientsError extends DoorbellError {
  override name = "NoClientsError" as const;

  constructor() {
    super("No other clients are connected to the doorbell at the moment");
  }
}
