import { DurableObject } from "cloudflare:workers";

import { normalizePathname, toResponse } from "../../lib/http";
import type { HttpResult } from "../../lib/types";
import { PHONEBELL_STORAGE_KEY } from "./constants";
import { isDoorOpenerAttachment, isPhoneAttachment } from "./lib";
import { PhonebellSocketCoordinator } from "./socket-coordinator";
import { PhonebellStateMachine } from "./state-machine";

export default class Phonebell extends DurableObject<Env> {
  private ringerState = false;
  private readonly ready: Promise<void>;
  private readonly coordinator: PhonebellSocketCoordinator;
  private readonly stateMachine: PhonebellStateMachine;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.coordinator = new PhonebellSocketCoordinator(ctx, env);
    this.stateMachine = new PhonebellStateMachine(
      this.coordinator,
      env,
      () => this.ringerState,
      async (state) => {
        await this.setRingerState(state);
      },
    );
    this.ready = this.ctx.blockConcurrencyWhile(async () => {
      this.ringerState =
        (await this.ctx.storage.get<boolean>(PHONEBELL_STORAGE_KEY)) ?? false;
    });
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;

    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return toResponse({
        status: 426,
        text: "Expected websocket upgrade",
      });
    }

    const pathname = normalizePathname(request.url);
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    if (!this.coordinator.acceptSocketForPath(pathname, server)) {
      return toResponse({
        status: 404,
        text: "Not found",
      });
    }

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async openFromBearer(
    token: string | null,
  ): Promise<HttpResult<string | undefined>> {
    await this.ready;

    if (token !== this.env.DISCORD_API_KEY) {
      return {
        status: 403,
        text: "Invalid API key",
      };
    }

    this.coordinator.triggerDoorOpener();
    return { status: 204 };
  }

  async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    await this.ready;

    const attachment = ws.deserializeAttachment();
    if (isPhoneAttachment(attachment)) {
      await this.stateMachine.handlePhoneWebSocketMessage(
        ws,
        attachment,
        message,
      );
      return;
    }

    if (isDoorOpenerAttachment(attachment)) {
      this.coordinator.handleDoorOpenerWebSocketMessage(
        ws,
        attachment,
        message,
      );
      return;
    }

    this.coordinator.relaySignalingMessage(ws, message);
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.ready;

    const attachment = ws.deserializeAttachment();
    if (!isPhoneAttachment(attachment)) {
      return;
    }

    await this.stateMachine.handlePhoneWebSocketClose(ws, attachment);
  }

  private async setRingerState(state: boolean): Promise<void> {
    this.ringerState = state;
    await this.ctx.storage.put(PHONEBELL_STORAGE_KEY, state);
  }
}
