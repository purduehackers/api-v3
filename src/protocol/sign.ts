import { z } from "zod";

export const WifiNetworkSchema = z.object({
  ssid: z.string(),
  password: z.string(),
  network_type: z.enum(["personal", "enterprise"]).default("personal"),
  enterprise_email: z.string().optional(),
  enterprise_username: z.string().optional(),
});

export const SignDeviceMessageSchema = z.discriminatedUnion("type", [
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
    networks: z.array(WifiNetworkSchema),
  }),
  z.object({
    type: z.literal("wifi_ack"),
    request_id: z.string(),
  }),
]);

export const SignDeviceMessageCodec = z.codec(z.string(), SignDeviceMessageSchema, {
  decode: (json) => JSON.parse(json) as z.infer<typeof SignDeviceMessageSchema>,
  encode: (value) => JSON.stringify(value),
});

export const SignSetWifiRequestSchema = z.object({
  networks: z.array(WifiNetworkSchema),
});

export const SignSetWifiRequestCodec = z.codec(z.string(), SignSetWifiRequestSchema, {
  decode: (json) => JSON.parse(json) as z.infer<typeof SignSetWifiRequestSchema>,
  encode: (value) => JSON.stringify(value),
});
