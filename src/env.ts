import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    SANITY_PROJECT_ID: z.string(),
    SANITY_TOKEN: z.string(),
    DISCORD_API_KEY: z.string(),
    PHONE_API_KEY: z.string(),
    DOOR_OPENER_API_KEY: z.string(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
