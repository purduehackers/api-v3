import type { HttpResult } from "../../lib/types";
import type { SignDeviceName } from "./enums";

export type SignSocketAttachment = {
  role: "device";
  authenticated: boolean;
  deviceName?: SignDeviceName;
};

export type WifiNetwork = {
  ssid: string;
  password: string;
  network_type: "personal" | "enterprise";
  enterprise_email?: string;
  enterprise_username?: string;
};

export type SignRequestMessage =
  | { type: "get_wifi"; request_id: string }
  | { type: "set_wifi"; request_id: string; networks: WifiNetwork[] };

export type SignWifiNetworksResult = {
  networks: unknown;
};

export type SignWifiAckResult = {
  ok: true;
};

export type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export type DeviceConnection = {
  ws: WebSocket;
  attachment: SignSocketAttachment;
};

export type DeviceRequestResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      response: HttpResult<{ error: string }>;
    };
