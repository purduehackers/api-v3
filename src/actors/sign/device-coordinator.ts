import type { HttpResult } from "../../lib/types";
import { SignDeviceMessageCodec, SignSetWifiRequestCodec } from "../../protocol/sign";
import { SignDeviceRegistry } from "./device-registry";
import { SignRequestTracker } from "./request-tracker";
import type {
  DeviceRequestResult,
  SignRequestMessage,
  SignWifiAckResult,
  SignWifiNetworksResult,
} from "./types";

const INVALID_REQUEST_BODY_RESULT: HttpResult<{ error: string }> = {
  status: 400,
  json: {
    error: "Invalid request body",
  },
};

const DEVICE_NOT_CONNECTED_RESULT: HttpResult<{ error: string }> = {
  status: 404,
  json: {
    error: "Device not connected",
  },
};

const DEVICE_DID_NOT_RESPOND_RESULT: HttpResult<{ error: string }> = {
  status: 504,
  json: {
    error: "Device did not respond",
  },
};

export class SignDeviceCoordinator {
  constructor(
    private readonly deviceRegistry: SignDeviceRegistry,
    private readonly requestTracker: SignRequestTracker,
  ) {}

  listDevices(): string[] {
    return Array.from(new Set(this.deviceRegistry.getConnectedDevices())).sort();
  }

  async getWifi(device: string): Promise<DeviceRequestResult<SignWifiNetworksResult>> {
    return this.requestDevice(device, (requestId) => ({
      type: "get_wifi",
      request_id: requestId,
    }));
  }

  async setWifi(device: string, rawBody: string): Promise<DeviceRequestResult<SignWifiAckResult>> {
    const validation = SignSetWifiRequestCodec.safeDecode(rawBody);
    if (!validation.success) {
      return {
        ok: false,
        response: INVALID_REQUEST_BODY_RESULT,
      };
    }

    return this.requestDevice(device, (requestId) => ({
      type: "set_wifi",
      request_id: requestId,
      networks: validation.data.networks,
    }));
  }

  handleWebSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    const rawMessage = typeof message === "string" ? message : new TextDecoder().decode(message);
    const validation = SignDeviceMessageCodec.safeDecode(rawMessage);
    if (!validation.success) {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Invalid JSON",
        }),
      );
      return;
    }

    const attachment = this.deviceRegistry.getSocketAttachment(ws);
    if (!attachment) {
      return;
    }

    switch (validation.data.type) {
      case "auth":
        if (!this.deviceRegistry.authenticateSocket(ws, validation.data.key)) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Invalid device key",
            }),
          );
          ws.close(1008, "Invalid device key");
        }
        break;
      case "wifi_networks":
        this.requestTracker.resolve(validation.data.request_id, {
          networks: validation.data.networks,
        } satisfies SignWifiNetworksResult);
        break;
      case "wifi_ack":
        this.requestTracker.resolve(validation.data.request_id, {
          ok: true,
        } satisfies SignWifiAckResult);
        break;
      case "ping":
        ws.send(
          JSON.stringify({
            type: "pong",
          }),
        );
        break;
      case "pong":
      case "status":
        break;
    }
  }

  private async requestDevice<T>(
    device: string,
    createMessage: (requestId: string) => SignRequestMessage,
  ): Promise<DeviceRequestResult<T>> {
    const ws = this.deviceRegistry.getDeviceSocket(device);
    if (!ws) {
      return {
        ok: false,
        response: DEVICE_NOT_CONNECTED_RESULT,
      };
    }

    try {
      return {
        ok: true,
        value: await this.requestTracker.send<T>(ws, createMessage(crypto.randomUUID())),
      };
    } catch {
      return {
        ok: false,
        response: DEVICE_DID_NOT_RESPOND_RESULT,
      };
    }
  }
}
