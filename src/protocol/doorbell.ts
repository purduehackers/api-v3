import { z } from "zod";

export const DoorbellMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("set"),
    ringing: z.boolean(),
  }),
  z.object({
    type: z.literal("status"),
    ringing: z.boolean(),
  }),
  z.object({
    type: z.literal("ping"),
  }),
  z.object({
    type: z.literal("pong"),
  }),
  z.object({
    type: z.literal("diagnostic"),
    level: z.enum(["info", "warning", "error"]),
    kind: z.string(),
    message: z.string(),
  }),
]);

export const DoorbellMessageCodec = z.codec(z.string(), DoorbellMessageSchema, {
  decode: (json) => JSON.parse(json) as z.infer<typeof DoorbellMessageSchema>,
  encode: (value) => JSON.stringify(value),
});
