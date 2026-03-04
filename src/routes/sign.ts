import { Elysia } from "elysia";
import type { ElysiaWS } from "elysia/ws";
import { z } from "zod";

import { env } from "../env";

// --- Schemas ---

const wifiNetworkSchema = z.object({
  ssid: z.string(),
  password: z.string(),
  network_type: z.enum(["personal", "enterprise"]).default("personal"),
  enterprise_email: z.string().optional(),
  enterprise_username: z.string().optional(),
});

type WifiNetwork = z.infer<typeof wifiNetworkSchema>;

const deviceMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("auth"),
    key: z.string(),
  }),
  z.object({
    type: z.literal("status"),
  }),
  z.object({
    type: z.literal("ping"),
  }),
  z.object({
    type: z.literal("pong"),
  }),
  z.object({
    type: z.literal("wifi_networks"),
    request_id: z.string(),
    networks: z.array(wifiNetworkSchema),
  }),
  z.object({
    type: z.literal("wifi_ack"),
    request_id: z.string(),
  }),
]);

type ServerMessage =
  | { type: "ping" }
  | { type: "pong" }
  | { type: "error"; message: string }
  | { type: "get_wifi"; request_id: string }
  | { type: "set_wifi"; request_id: string; networks: WifiNetwork[] };

// --- State ---

let provisioned = false;

// --- Pending Requests ---

const pendingRequests = new Map<
  string,
  { resolve: (data: any) => void; timer: ReturnType<typeof setTimeout> }
>();

function sendDeviceRequest(
  client: ElysiaWS,
  message: ServerMessage,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const requestId =
      "request_id" in message ? message.request_id : undefined;
    if (!requestId) {
      reject(new Error("Message has no request_id"));
      return;
    }

    const timer = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error("Device request timed out"));
    }, 10_000);

    pendingRequests.set(requestId, { resolve, timer });
    client.send(JSON.stringify(message));
  });
}

function resolveRequest(requestId: string, data: any) {
  const pending = pendingRequests.get(requestId);
  if (pending) {
    clearTimeout(pending.timer);
    pendingRequests.delete(requestId);
    pending.resolve(data);
  }
}

// --- Client Manager ---

class SignClientManager {
  protected clients: Map<string, ElysiaWS>;

  constructor() {
    this.clients = new Map();
  }

  addClient(deviceName: string, client: ElysiaWS) {
    this.clients.set(deviceName, client);
  }

  removeClient(deviceName: string) {
    this.clients.delete(deviceName);
  }

  getClient(deviceName: string): ElysiaWS | undefined {
    return this.clients.get(deviceName);
  }

  sendMessage(deviceName: string, message: ServerMessage) {
    const client = this.clients.get(deviceName);
    if (client) {
      client.send(JSON.stringify(message));
    }
  }

  sendToAll(message: ServerMessage) {
    for (const client of this.clients.values()) {
      client.send(JSON.stringify(message));
    }
  }
}

// --- Router ---

const router = new Elysia();

router.group("/sign", (app) => {
  app
    .decorate("signClients", new SignClientManager())
    .post("/provision", async ({ set }) => {
      if (!env.SIGN_PROVISION_KEY) {
        set.status = 403;
        return { error: "Provisioning is disabled" };
      }

      if (provisioned) {
        set.status = 403;
        return { error: "Already provisioned" };
      }

      provisioned = true;

      return { key: env.SIGN_PROVISION_KEY };
    })
    .get("/:device/wifi", async ({ params, set, signClients }) => {
      const client = signClients.getClient(params.device);
      if (!client) {
        set.status = 404;
        return { error: "Device not connected" };
      }

      const requestId = crypto.randomUUID();
      try {
        const result = await sendDeviceRequest(client, {
          type: "get_wifi",
          request_id: requestId,
        });
        return { networks: result.networks };
      } catch {
        set.status = 504;
        return { error: "Device did not respond" };
      }
    })
    .put(
      "/:device/wifi",
      async ({ params, body, set, signClients }) => {
        const client = signClients.getClient(params.device);
        if (!client) {
          set.status = 404;
          return { error: "Device not connected" };
        }

        const requestId = crypto.randomUUID();
        try {
          await sendDeviceRequest(client, {
            type: "set_wifi",
            request_id: requestId,
            networks: body.networks,
          });
          return { ok: true };
        } catch {
          set.status = 504;
          return { error: "Device did not respond" };
        }
      },
      {
        body: z.object({
          networks: z.array(wifiNetworkSchema),
        }),
      },
    )
    .ws("/ws", {
      open(ws) {
        console.log(`[Sign] WebSocket connected: ${ws.id}`);
      },
      message(ws, data) {
        let parsed;
        try {
          parsed = typeof data === "string" ? JSON.parse(data) : data;
        } catch {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Invalid JSON",
            } satisfies ServerMessage),
          );
          return;
        }

        const validation = deviceMessageSchema.safeParse(parsed);
        if (!validation.success) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Invalid message format",
            } satisfies ServerMessage),
          );
          return;
        }

        const message = validation.data;

        switch (message.type) {
          case "auth": {
            const device = (() => {
              switch (message.key) {
                case env.SIGN_API_KEY:
                  return "sign";
                case env.DSAI_SIGN_API_KEY:
                  return "dsai";
                default:
                  return null;
              }
            })();
            if (!device) {
              ws.send(
                JSON.stringify({
                  type: "error",
                  message: "Invalid device key",
                } satisfies ServerMessage),
              );
              ws.close();
              return;
            }

            (ws.data as any).deviceName = device;
            ws.data.signClients.addClient(device, ws);
            console.log(`[Sign] Device authenticated: ${device}`);
            break;
          }
          case "wifi_networks": {
            resolveRequest(message.request_id, {
              networks: message.networks,
            });
            break;
          }
          case "wifi_ack": {
            resolveRequest(message.request_id, { ok: true });
            break;
          }
          case "status": {
            console.log(
              `[Sign] Status from ${(ws.data as any).deviceName ?? "unauthenticated"}`,
            );
            break;
          }
          case "ping": {
            ws.send(JSON.stringify({ type: "pong" } satisfies ServerMessage));
            break;
          }
          case "pong": {
            break;
          }
        }
      },
      close(ws) {
        const deviceName = (ws.data as any).deviceName;
        if (deviceName) {
          ws.data.signClients.removeClient(deviceName);
          console.log(`[Sign] Device disconnected: ${deviceName}`);
        }
      },
    });

  return app;
});

export default router;
