import { SIGN_DEVICE_REQUEST_TIMEOUT_MS } from "./constants";
import { SignDeviceRequestTimeoutError } from "./errors";
import type { PendingRequest, SignRequestMessage } from "./types";

export class SignRequestTracker {
  private readonly pendingRequests = new Map<string, PendingRequest>();

  send<T>(ws: WebSocket, message: SignRequestMessage): Promise<T> {
    return new Promise((resolve, reject) => {
      const resolveRequest: PendingRequest["resolve"] = (value) => {
        resolve(value as T);
      };
      const timer = setTimeout(() => {
        this.pendingRequests.delete(message.request_id);
        reject(new SignDeviceRequestTimeoutError());
      }, SIGN_DEVICE_REQUEST_TIMEOUT_MS);

      this.pendingRequests.set(message.request_id, {
        resolve: resolveRequest,
        reject,
        timer,
      });

      ws.send(JSON.stringify(message));
    });
  }

  resolve(requestId: string, data: unknown): void {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timer);
    this.pendingRequests.delete(requestId);
    pending.resolve(data);
  }
}
