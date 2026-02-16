import { Elysia } from "elysia";
import type { ElysiaWS } from "elysia/ws";
import { z } from "zod";

import { env } from "../env";

const authMessageSchema = z.object({
  token: z.string(),
});
type AuthenticationMessage = z.infer<typeof authMessageSchema>;

const discordMessageSchema = z.object({
  id: z.string(),
  channel: z.object({
    id: z.string(),
    name: z.string(),
  }),
  author: z.object({
    id: z.string(),
    name: z.string(),
    avatarHash: z.string().nullable(),
  }),
  timestamp: z.iso.datetime({ offset: true }).transform((d) => new Date(d)),
  content: z.string(),
  attachments: z.array(z.string()).default([]),
});
type DiscordMessage = z.infer<typeof discordMessageSchema>;

class BotClientManager {
  protected clients: Record<string, ElysiaWS>;

  constructor() {
    this.clients = {};
  }

  checkVerified(client: ElysiaWS) {
    return !!this.clients[client.id];
  }

  addClient(client: ElysiaWS) {
    this.clients[client.id] = client;
    console.log(`[Discord] bot client authorized`, { id: client.id });
  }

  removeClient(client: ElysiaWS) {
    delete this.clients[client.id];
    console.log(`[Discord] bot client disconnected`, { id: client.id });
  }

  sendMessageToClient(client: ElysiaWS, message: DiscordMessage) {
    return client.send(JSON.stringify(message));
  }

  sendToConnectedClients(message: DiscordMessage) {
    for (const client of Object.values(this.clients)) {
      this.sendMessageToClient(client, message);
    }
  }
}

class DashboardClientManager {
  protected clients: Set<ElysiaWS>;

  constructor() {
    this.clients = new Set();
  }

  addClient(client: ElysiaWS) {
    this.clients.add(client);
    console.log(`[Discord] dashboard client connected`, { id: client.id });
  }

  removeClient(client: ElysiaWS) {
    this.clients.delete(client);
    console.log(`[Discord] dashboard client disconnected`, { id: client.id });
  }

  sendMessageToClient(client: ElysiaWS, message: DiscordMessage) {
    return client.send(JSON.stringify(message));
  }

  sendToConnectedClients(message: DiscordMessage) {
    for (const client of this.clients) {
      this.sendMessageToClient(client, message);
    }
  }
}

const router = new Elysia();

router.group("/discord", (app) =>
  app
    .decorate("bots", new BotClientManager())
    .decorate("dashboards", new DashboardClientManager())
    .ws("/bot", {
      open: (ws) => {
        console.log(`[Discord] bot client connected`, { id: ws.id });
      },
      message: (ws, data) => {
        let result: unknown;
        try {
          result = JSON.parse(String(data));
        } catch {
          result = data as unknown;
        }

        const verified = ws.data.bots.checkVerified(ws);
        if (!verified) {
          const validation = authMessageSchema.safeParse(result);
          if (!validation || !validation.success) {
            return;
          }

          const message = validation.data as AuthenticationMessage;

          if (message.token !== env.DISCORD_API_KEY) {
            console.log(`[Discord] bot client failed authentication`, {
              id: ws.id,
            });
            ws.send(JSON.stringify({ auth: "rejected" }));
            ws.close();
            return;
          }

          ws.data.bots.addClient(ws);
          ws.send(JSON.stringify({ auth: "complete" }));
          return;
        }

        const validation = discordMessageSchema.safeParse(result);
        if (!validation || !validation.success) {
          return;
        }

        const message = validation.data as DiscordMessage;
        console.debug(`[Discord] message received for forwarding`, message);
        ws.data.dashboards.sendToConnectedClients(message);
      },
      close: (ws) => {
        const verified = ws.data.bots.checkVerified(ws);
        if (verified) {
          ws.data.bots.removeClient(ws);
        }
      },
    })
    .ws("/dashboard", {
      open: (ws) => {
        ws.data.dashboards.addClient(ws);
      },
      close: (ws) => {
        ws.data.dashboards.removeClient(ws);
      },
    }),
);

export default router;
