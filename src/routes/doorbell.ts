import { Elysia } from "elysia";
import type { ElysiaWS } from "elysia/ws";
import { z } from "zod";

import { env } from "../env";

// Validate messages to and from the doorbell
const messageSchema = z.object({
  type: z.enum(["set", "status"]),
  ringing: z.boolean(),
});

type DoorbellMessage = z.infer<typeof messageSchema>;

const router = new Elysia();

router.group("/doorbell", (app) => {
  app
    .state("isRinging", false)
    .decorate("doorbells", new DoorbellClientManager())
    .ws("/", {
      open: (ws) => {
        ws.data.doorbells.addClient(ws);
        ws.data.doorbells.sendMessageToClient(ws, {
          type: "status",
          ringing: ws.data.store.isRinging,
        });
      },
      message: (ws, data) => {
        let result: DoorbellMessage;

        try {
          result = JSON.parse(String(data));
        } catch (err) {
          result = data as DoorbellMessage;
        }

        const validation = messageSchema.safeParse(result);

        if (!validation || !validation.success) return;

        const message = validation.data;

        ws.data.store.isRinging = message.ringing;
        ws.data.doorbells.sendToConnectedClients({
          type: "status",
          ringing: ws.data.store.isRinging,
        });
      },
      close(ws) {
        ws.data.doorbells.removeClient(ws);
      },
    })
    .get("/status", ({ store }) => {
      return {
        ringing: store.isRinging,
      };
    })
    .post("/ring", async ({ store, doorbells }) => {
      if (store.isRinging) {
        return new Response("Already ringing", { status: 400 });
      }

      store.isRinging = true;

      doorbells.sendToConnectedClients({
        type: "status",
        ringing: store.isRinging,
      });

      return { ok: true };
    });

  return app;
});

class DoorbellClientManager {
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

  sendMessageToClient(client: ElysiaWS, message: DoorbellMessage) {
    return client.send(JSON.stringify(message));
  }

  sendToConnectedClients(message: DoorbellMessage) {
    for (const client of this.clients) {
      this.sendMessageToClient(client, message);
    }
  }
}

export default router;
