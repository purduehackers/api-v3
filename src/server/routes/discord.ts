import { Hono } from "hono";

import { DISCORD_ACTOR_NAME } from "../../actors/discord/constants";

const router = new Hono<{ Bindings: Env }>();

router.get("/bot", async (c) => {
  const stub = c.env.DISCORD_ACTOR.getByName(DISCORD_ACTOR_NAME);
  return stub.fetch(c.req.raw);
});

router.get("/dashboard", async (c) => {
  const stub = c.env.DISCORD_ACTOR.getByName(DISCORD_ACTOR_NAME);
  return stub.fetch(c.req.raw);
});

export default router;
