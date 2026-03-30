import { z } from "zod";

export const PhoneIncomingMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("Dial"),
    number: z.string(),
  }),
  z.object({
    type: z.literal("Hook"),
    state: z.boolean(),
  }),
]);

export const PhoneIncomingMessageCodec = z.codec(z.string(), PhoneIncomingMessageSchema, {
  decode: (json) => JSON.parse(json) as z.infer<typeof PhoneIncomingMessageSchema>,
  encode: (value) => JSON.stringify(value),
});
