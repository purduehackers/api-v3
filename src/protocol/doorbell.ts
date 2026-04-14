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

export type DoorbellMessage = z.infer<typeof DoorbellMessageSchema>;
