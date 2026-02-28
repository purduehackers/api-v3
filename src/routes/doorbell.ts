import { Elysia } from "elysia";
import type { ElysiaWS } from "elysia/ws";
import { z } from "zod";

/**
 * Error class for doorbell errors that can be sent over the WebSocket connection
 */
class DoorbellError extends Error {
  toWSMessage(
    level: Extract<DoorbellMessage, { type: "diagnostic" }>["level"],
  ): DoorbellMessage {
    return {
      type: "diagnostic",
      level,
      kind: this.name,
      message: this.message,
    };
  }
}

class NoClientsError extends DoorbellError {
  name = "NoClientsError" as const;
  constructor() {
    super("No other clients are connected to the doorbell at the moment");
  }
}

const messageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.enum(["set", "status"]),
    ringing: z.boolean(),
  }),
  z.object({
    type: z.enum(["ping", "pong"]),
  }),
  z.object({
    type: z.literal("diagnostic"),
    level: z.enum(["info", "warning", "error"]),
    kind: z.string(),
    message: z.string(),
  }),
]);
type DoorbellMessage = z.infer<typeof messageSchema>;

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

  sendToConnectedClients(message: DoorbellMessage, ws?: ElysiaWS) {
    if (ws !== undefined && this.clients.size === 1 && this.clients.has(ws)) {
      throw new NoClientsError();
    }
    for (const client of this.clients) {
      this.sendMessageToClient(client, message);
    }
  }
}

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

        switch (message.type) {
          case "set":
            ws.data.store.isRinging = message.ringing;
            try {
              ws.data.doorbells.sendToConnectedClients({
                type: "status",
                ringing: ws.data.store.isRinging,
              });
            } catch (error) {
              if (error instanceof DoorbellError) {
                ws.send(JSON.stringify(error.toWSMessage("warning")));
              } else {
                throw error;
              }
            }
            break;
          case "ping":
            ws.send(
              JSON.stringify({
                type: "pong",
              } satisfies DoorbellMessage),
            );
            break;
          case "status":
            break;
          case "pong":
            break;
        }
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

      try {
        doorbells.sendToConnectedClients({
          type: "status",
          ringing: store.isRinging,
        });
      } finally {
        // Ignore errors
        return { ok: true };
      }
    });

  return app;
});

export default router;
