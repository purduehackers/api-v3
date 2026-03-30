import { z } from "zod";

export const DiscordAuthMessageSchema = z.object({
  token: z.string(),
});

export const DiscordAuthMessageCodec = z.codec(
  z.string(),
  DiscordAuthMessageSchema,
  {
    decode: (json) =>
      JSON.parse(json) as z.infer<typeof DiscordAuthMessageSchema>,
    encode: (value) => JSON.stringify(value),
  },
);

export const DiscordMessageSchema = z.object({
  id: z.string(),
  channel: z.object({
    id: z.string(),
    name: z.string(),
  }),
  author: z.object({
    id: z.string(),
    name: z.string(),
    avatarHash: z.string().nullable(),
  }),
  timestamp: z.iso.datetime({ offset: true }),
  content: z.object({
    markdown: z.string(),
    html: z.string(),
  }),
  attachments: z.array(z.string()).default([]),
});

export const DiscordMessageCodec = z.codec(z.string(), DiscordMessageSchema, {
  decode: (json) => JSON.parse(json) as z.infer<typeof DiscordMessageSchema>,
  encode: (value) => JSON.stringify(value),
});
