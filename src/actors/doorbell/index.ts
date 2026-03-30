import { DurableObject } from "cloudflare:workers";

import { normalizePathname, toResponse } from "../../lib/http";
import type { HttpResult } from "../../lib/types";
import { DoorbellMessageCodec } from "../../protocol/doorbell";
import {
  DOORBELL_PATH,
  DOORBELL_SOCKET_TAG,
  DOORBELL_STORAGE_KEY,
} from "./constants";
import { DoorbellDiagnosticLevel } from "./enums";
import { NoClientsError, DoorbellError } from "./errors";
import type { DoorbellMessage } from "./types";

export default class Doorbell extends DurableObject<Env> {
  private ringing = false;
  private readonly ready: Promise<void>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ready = this.ctx.blockConcurrencyWhile(async () => {
      this.ringing =
        (await this.ctx.storage.get<boolean>(DOORBELL_STORAGE_KEY)) ?? false;
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

    if (!pathname.endsWith(DOORBELL_PATH)) {
      return toResponse({
        status: 404,
        text: "Not found",
      });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    this.ctx.acceptWebSocket(server, [DOORBELL_SOCKET_TAG]);
    server.serializeAttachment({
      role: "doorbell",
    });
    server.send(
      JSON.stringify({
        type: "status",
        ringing: this.ringing,
      }),
    );

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async getStatus(): Promise<HttpResult<{ ringing: boolean }>> {
    await this.ready;
    return {
      status: 200,
      json: {
        ringing: this.ringing,
      },
    };
  }

  async ring(): Promise<HttpResult<{ ok: true } | string>> {
    await this.ready;

    if (this.ringing) {
      return {
        status: 400,
        text: "Already ringing",
      };
    }

    await this.setRinging(true);
    this.broadcastStatus();
    return { status: 200, json: { ok: true } };
  }

  async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    await this.ready;

    const rawMessage =
      typeof message === "string" ? message : new TextDecoder().decode(message);
    const validation = DoorbellMessageCodec.safeDecode(rawMessage);
    if (!validation.success) {
      return;
    }

    switch (validation.data.type) {
      case "set":
        await this.setRinging(validation.data.ringing);

        try {
          this.broadcastStatus(ws);
        } catch (error) {
          if (error instanceof DoorbellError) {
            ws.send(
              JSON.stringify(
                error.toWSMessage(DoorbellDiagnosticLevel.Warning),
              ),
            );
            return;
          }

          throw error;
        }
        break;
      case "ping":
        ws.send(JSON.stringify({ type: "pong" }));
        break;
      case "diagnostic":
      case "pong":
      case "status":
        break;
    }
  }

  private async setRinging(ringing: boolean): Promise<void> {
    this.ringing = ringing;
    await this.ctx.storage.put(DOORBELL_STORAGE_KEY, ringing);
  }

  private broadcastStatus(source?: WebSocket): void {
    const sockets = this.ctx.getWebSockets(DOORBELL_SOCKET_TAG);
    if (source !== undefined && sockets.length === 1 && sockets[0] === source) {
      throw new NoClientsError();
    }

    const message: DoorbellMessage = {
      type: "status",
      ringing: this.ringing,
    };

    for (const socket of sockets) {
      socket.send(JSON.stringify(message));
    }
  }
}
