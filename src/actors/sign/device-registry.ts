import { SIGN_DEVICE_TAG } from "./constants";
import { SignDeviceName } from "./enums";
import type { DeviceConnection, SignSocketAttachment } from "./types";

export class SignDeviceRegistry {
  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Env,
  ) {}

  acceptSocket(server: WebSocket): void {
    this.ctx.acceptWebSocket(server, [SIGN_DEVICE_TAG]);
    server.serializeAttachment({
      role: "device",
      authenticated: false,
    });
  }

  getSocketAttachment(ws: WebSocket): SignSocketAttachment | null {
    const attachment = ws.deserializeAttachment();
    if (!this.isSignSocketAttachment(attachment)) {
      return null;
    }

    return attachment;
  }

  authenticateSocket(ws: WebSocket, key: string): SignDeviceName | null {
    const deviceName = this.getDeviceName(key);
    if (!deviceName) {
      return null;
    }

    this.closeOtherSocketsForDevice(deviceName, ws);
    ws.serializeAttachment({
      role: "device",
      authenticated: true,
      deviceName,
    });

    return deviceName;
  }

  getConnectedDevices(): string[] {
    return this.getDeviceConnections()
      .filter(
        ({ attachment }) => attachment.authenticated && attachment.deviceName,
      )
      .map(({ attachment }) => attachment.deviceName)
      .filter(
        (deviceName): deviceName is SignDeviceName => deviceName !== undefined,
      );
  }

  getDeviceSocket(device: string): WebSocket | null {
    for (const { ws, attachment } of this.getDeviceConnections()) {
      if (attachment.authenticated && attachment.deviceName === device) {
        return ws;
      }
    }

    return null;
  }

  private getDeviceName(key: string): SignDeviceName | null {
    switch (key) {
      case this.env.BIDC_SIGN_API_KEY:
        return SignDeviceName.Sign;
      case this.env.DSAI_SIGN_API_KEY:
        return SignDeviceName.Dsai;
      default:
        return null;
    }
  }

  private getDeviceConnections(): DeviceConnection[] {
    const connections: DeviceConnection[] = [];

    for (const ws of this.ctx.getWebSockets(SIGN_DEVICE_TAG)) {
      const attachment = ws.deserializeAttachment();
      if (this.isSignSocketAttachment(attachment)) {
        connections.push({ ws, attachment });
      }
    }

    return connections;
  }

  private closeOtherSocketsForDevice(
    deviceName: SignDeviceName,
    current: WebSocket,
  ): void {
    for (const { ws, attachment } of this.getDeviceConnections()) {
      if (ws === current) {
        continue;
      }

      if (attachment.authenticated && attachment.deviceName === deviceName) {
        ws.close(1000, "Superseded by a newer connection");
      }
    }
  }

  private isSignSocketAttachment(
    attachment: unknown,
  ): attachment is SignSocketAttachment {
    return (
      typeof attachment === "object" &&
      attachment !== null &&
      "role" in attachment &&
      attachment.role === "device"
    );
  }
}
