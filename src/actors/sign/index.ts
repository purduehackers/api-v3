import { DurableObject } from "cloudflare:workers";

import { normalizePathname, toResponse } from "../../lib/http";
import type { HttpResult } from "../../lib/types";
import { SIGN_PROVISIONED_STORAGE_KEY, SIGN_WS_PATH } from "./constants";
import { SignDeviceCoordinator } from "./device-coordinator";
import { SignDeviceRegistry } from "./device-registry";
import { SignRequestTracker } from "./request-tracker";

export default class Sign extends DurableObject<Env> {
  private provisioned = false;
  private readonly ready: Promise<void>;
  private readonly deviceRegistry: SignDeviceRegistry;
  private readonly coordinator: SignDeviceCoordinator;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.deviceRegistry = new SignDeviceRegistry(ctx, env);
    this.coordinator = new SignDeviceCoordinator(
      this.deviceRegistry,
      new SignRequestTracker(),
    );
    this.ready = this.ctx.blockConcurrencyWhile(async () => {
      this.provisioned =
        (await this.ctx.storage.get<boolean>(SIGN_PROVISIONED_STORAGE_KEY)) ??
        false;
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
    if (!pathname.endsWith(SIGN_WS_PATH)) {
      return toResponse({
        status: 404,
        text: "Not found",
      });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    this.deviceRegistry.acceptSocket(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async provision(): Promise<HttpResult<{ key: string } | { error: string }>> {
    await this.ready;

    if (!this.env.SIGN_PROVISION_KEY) {
      return {
        status: 403,
        json: {
          error: "Provisioning is disabled",
        },
      };
    }

    if (this.provisioned) {
      return {
        status: 403,
        json: {
          error: "Already provisioned",
        },
      };
    }

    this.provisioned = true;
    await this.ctx.storage.put(SIGN_PROVISIONED_STORAGE_KEY, true);

    return {
      status: 200,
      json: {
        key: this.env.SIGN_PROVISION_KEY,
      },
    };
  }

  async listDevices(): Promise<HttpResult<{ devices: string[] }>> {
    await this.ready;

    const devices = this.coordinator.listDevices();
    return { status: 200, json: { devices } };
  }

  async getWifi(
    device: string,
  ): Promise<HttpResult<{ networks: unknown } | { error: string }>> {
    await this.ready;

    const request = await this.coordinator.getWifi(device);
    if (!request.ok) {
      return request.response;
    }

    return {
      status: 200,
      json: {
        networks: request.value.networks,
      },
    };
  }

  async setWifi(
    device: string,
    rawBody: string,
  ): Promise<HttpResult<{ ok: true } | { error: string }>> {
    await this.ready;

    const request = await this.coordinator.setWifi(device, rawBody);
    if (!request.ok) {
      return request.response;
    }

    return { status: 200, json: { ok: true } };
  }

  async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    await this.ready;
    this.coordinator.handleWebSocketMessage(ws, message);
  }
}
