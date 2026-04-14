import { DurableObject } from "cloudflare:workers";

import { normalizePathname, toResponse } from "../../lib/http";
import type { HttpResult } from "../../lib/types";
import {
  DiscordAuthMessageCodec,
  DiscordMessageCodec,
  DiscordMessageSchema,
} from "../../protocol/discord";
import { DISCORD_BOT_PATH, DISCORD_DASHBOARD_PATH } from "./constants";
import { DiscordSocketRole } from "./enums";
import { isBotAttachment } from "./lib";
import type { DiscordAuthResponse, DiscordSocketAttachment } from "./types";

export default class Discord extends DurableObject<Env> {
  fetch(request: Request): Response {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return toResponse({
        status: 426,
        text: "Expected websocket upgrade",
      });
    }

    const pathname = normalizePathname(request.url);

    let role: DiscordSocketRole | null = null;
    if (pathname.endsWith(DISCORD_BOT_PATH)) {
      role = DiscordSocketRole.Bot;
    } else if (pathname.endsWith(DISCORD_DASHBOARD_PATH)) {
      role = DiscordSocketRole.Dashboard;
    }

    if (role === null) {
      return toResponse({
        status: 404,
        text: "Not found",
      });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    this.ctx.acceptWebSocket(server, [role]);
    if (role === DiscordSocketRole.Bot) {
      server.serializeAttachment({
        role: DiscordSocketRole.Bot,
        authenticated: false,
      } satisfies DiscordSocketAttachment);
    } else {
      server.serializeAttachment({
        role: DiscordSocketRole.Dashboard,
      } satisfies DiscordSocketAttachment);
    }

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  publishMessage(
    token: string | null,
    payload: unknown,
  ): HttpResult<{ ok: true }> {
    if (token !== this.env.DISCORD_API_KEY) {
      return { status: 403, text: "Invalid API key" };
    }

    const validation = DiscordMessageSchema.safeParse(payload);
    if (!validation.success) {
      return { status: 400, text: "Invalid message" };
    }

    const serialized = JSON.stringify(validation.data);
    for (const dashboard of this.ctx.getWebSockets(
      DiscordSocketRole.Dashboard,
    )) {
      dashboard.send(serialized);
    }

    return { status: 200, json: { ok: true } };
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    const attachment = ws.deserializeAttachment();
    const rawMessage =
      typeof message === "string" ? message : new TextDecoder().decode(message);

    if (!isBotAttachment(attachment)) {
      return;
    }

    if (!attachment.authenticated) {
      const validation = DiscordAuthMessageCodec.safeDecode(rawMessage);
      if (!validation.success) {
        return;
      }

      const authReply: DiscordAuthResponse = {
        auth:
          validation.data.token === this.env.DISCORD_API_KEY
            ? "complete"
            : "rejected",
      };

      ws.send(JSON.stringify(authReply));

      if (authReply.auth === "rejected") {
        ws.close(1008, "Invalid token");
        return;
      }

      ws.serializeAttachment({
        role: DiscordSocketRole.Bot,
        authenticated: true,
      } satisfies DiscordSocketAttachment);
      return;
    }

    const validation = DiscordMessageCodec.safeDecode(rawMessage);
    if (!validation.success) {
      return;
    }

    for (const dashboard of this.ctx.getWebSockets(
      DiscordSocketRole.Dashboard,
    )) {
      dashboard.send(JSON.stringify(validation.data));
    }
  }
}
