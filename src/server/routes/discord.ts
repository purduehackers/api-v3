import { Hono } from "hono";

import { DISCORD_ACTOR_NAME } from "../../actors/discord/constants";
import { toResponse } from "../../lib/http";

const router = new Hono<{ Bindings: Env }>();

router.get("/bot", async (c) => {
  const stub = c.env.DISCORD_ACTOR.getByName(DISCORD_ACTOR_NAME);
  return stub.fetch(c.req.raw);
});

router.post("/bot", async (c) => {
  const token =
    c.req
      .header("authorization")
      ?.trim()
      .match(/^Bearer\s+(.+)$/i)?.[1] ?? null;

  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch {
    return toResponse({ status: 400, text: "Invalid JSON" });
  }

  const stub = c.env.DISCORD_ACTOR.getByName(DISCORD_ACTOR_NAME);
  return toResponse(await stub.publishMessage(token, payload));
});

router.get("/dashboard", async (c) => {
  const stub = c.env.DISCORD_ACTOR.getByName(DISCORD_ACTOR_NAME);
  return stub.fetch(c.req.raw);
});

export default router;
