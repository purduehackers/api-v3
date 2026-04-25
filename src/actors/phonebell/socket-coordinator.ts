import { PHONEBELL_PATHS, PHONEBELL_SOCKET_TAGS } from "./constants";
import { PhoneStatus, PhoneType } from "./enums";
import { isDoorOpenerAttachment, isPhoneAttachment } from "./lib";
import type { DoorOpenerAttachment, PhoneConnection, PhoneConnectionAttachment } from "./types";

export class PhonebellSocketCoordinator {
  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Env,
  ) {}

  acceptSocketForPath(pathname: string, server: WebSocket): boolean {
    if (pathname.endsWith(PHONEBELL_PATHS.outside)) {
      this.acceptPhoneSocket(server, PhoneType.Outside, PHONEBELL_SOCKET_TAGS.outside);
      return true;
    }

    if (pathname.endsWith(PHONEBELL_PATHS.inside)) {
      this.acceptPhoneSocket(server, PhoneType.Inside, PHONEBELL_SOCKET_TAGS.inside);
      return true;
    }

    if (pathname.endsWith(PHONEBELL_PATHS.doorOpener)) {
      this.acceptDoorOpenerSocket(server);
      return true;
    }

    if (pathname.endsWith(PHONEBELL_PATHS.signaling)) {
      this.acceptSignalingSocket(server);
      return true;
    }

    return false;
  }

  handleDoorOpenerWebSocketMessage(
    ws: WebSocket,
    attachment: DoorOpenerAttachment,
    message: string | ArrayBuffer,
  ): void {
    if (attachment.authenticated) {
      return;
    }

    const key = (typeof message === "string" ? message : new TextDecoder().decode(message)).trim();
    if (key !== this.env.DOOR_OPENER_API_KEY) {
      ws.close(1008, "Invalid API key");
      return;
    }

    ws.serializeAttachment({
      role: "door-opener",
      authenticated: true,
    } satisfies DoorOpenerAttachment);
  }

  relaySignalingMessage(source: WebSocket, message: string | ArrayBuffer): void {
    const text = typeof message === "string" ? message : new TextDecoder().decode(message);
    for (const socket of this.ctx.getWebSockets(PHONEBELL_SOCKET_TAGS.signaling)) {
      if (socket !== source) {
        socket.send(text);
      }
    }
  }

  getPhoneConnections(exclude?: WebSocket): PhoneConnection[] {
    const entries: PhoneConnection[] = [];

    for (const socket of this.ctx.getWebSockets(PHONEBELL_SOCKET_TAGS.phone)) {
      if (socket === exclude) {
        continue;
      }

      const attachment = socket.deserializeAttachment();
      if (isPhoneAttachment(attachment)) {
        entries.push({ ws: socket, attachment });
      }
    }

    return entries;
  }

  getActiveCallers(exclude?: WebSocket): number {
    let count = 0;

    for (const { attachment } of this.getPhoneConnections(exclude)) {
      if (attachment.authenticated && attachment.inCall) {
        count += 1;
      }
    }

    return count;
  }

  triggerDoorOpener(): void {
    const sockets = this.ctx
      .getWebSockets(PHONEBELL_SOCKET_TAGS.doorOpener)
      .filter(socket => {
        const attachment = socket.deserializeAttachment();
        return isDoorOpenerAttachment(attachment) && attachment.authenticated;
      });
    if (sockets.length === 0) {
      throw new Error("No door-opener connected via WebSocket");
    }
    for (const socket of sockets) {
      socket.send(JSON.stringify({ type: "Open" }));
      // TODO(@rayhanadev): wait for ACK from sockets.
      // Message will look like `{"type": "OpenAck"}`.
      // If no ACK after 1 or 2 seconds, throw an Error.
    }
  }

  private acceptPhoneSocket(
    server: WebSocket,
    phoneType: PhoneType,
    tag: typeof PHONEBELL_SOCKET_TAGS.inside | typeof PHONEBELL_SOCKET_TAGS.outside,
  ): void {
    this.ctx.acceptWebSocket(server, [PHONEBELL_SOCKET_TAGS.phone, tag]);
    server.serializeAttachment({
      role: "phone",
      phoneType,
      authenticated: false,
      status: PhoneStatus.Idle,
      hookState: true,
      dialedNumber: "",
      inCall: false,
    } satisfies PhoneConnectionAttachment);
  }

  private acceptDoorOpenerSocket(server: WebSocket): void {
    this.ctx.acceptWebSocket(server, [PHONEBELL_SOCKET_TAGS.doorOpener]);
    server.serializeAttachment({
      role: "door-opener",
      authenticated: false,
    } satisfies DoorOpenerAttachment);
  }

  private acceptSignalingSocket(server: WebSocket): void {
    this.ctx.acceptWebSocket(server, [PHONEBELL_SOCKET_TAGS.signaling]);
    server.serializeAttachment({
      role: "signaling",
    });
  }
}
