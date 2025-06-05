import { Elysia } from "elysia";
import type { ElysiaWS } from "elysia/ws";
import { z } from "zod";

import { env } from "../env";

const authMessageSchema = z.object({
  token: z.string(),
});
type AuthenticationMessage = z.infer<typeof authMessageSchema>;

const discordMessageSchema = z.object({
  image: z.string().url().optional(),
  timestamp: z.string(),
  username: z.string(),
  content: z.string(),
  attachments: z.array(z.string()).default([]),
});
type DiscordMessage = z.infer<typeof discordMessageSchema>;

const router = new Elysia();

router.group("/discord", (app) =>
  app
    .decorate("bots", new BotClientManager())
    .decorate("dashboards", new DashboardClientManager())
    .ws("/bot", {
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
          if (!validation || !validation.success) return;

          const message = validation.data;

          if (message.token !== env.DISCORD_API_KEY) {
            ws.close();
            return;
          }

          ws.data.bots.addClient(ws);
          return;
        }

        const validation = discordMessageSchema.safeParse(result);

        if (!validation || !validation.success) return;

        const message = validation.data;

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

class BotClientManager {
  protected clients: Set<ElysiaWS>;

  constructor() {
    this.clients = new Set();
  }

  checkVerified(client: ElysiaWS) {
    if (this.clients.has(client)) return true;
    return false;
  }

  addClient(client: ElysiaWS) {
    this.clients.add(client);
  }

  removeClient(client: ElysiaWS) {
    this.clients.delete(client);
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

class DashboardClientManager {
  protected clients: Set<ElysiaWS>;

  constructor() {
    this.clients = new Set();
  }

  addClient(client: ElysiaWS) {
    this.clients.add(client);
  }

  removeClient(client: ElysiaWS) {
    this.clients.delete(client);
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
