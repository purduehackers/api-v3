import { Hono } from "hono";

import { PHONEBELL_ACTOR_NAME } from "../../actors/phonebell/constants";
import { toResponse } from "../../lib/http";

const router = new Hono<{ Bindings: Env }>();

router.get("/outside", async (c) => {
  const stub = c.env.PHONEBELL_ACTOR.getByName(PHONEBELL_ACTOR_NAME);
  return stub.fetch(c.req.raw);
});

router.get("/inside", async (c) => {
  const stub = c.env.PHONEBELL_ACTOR.getByName(PHONEBELL_ACTOR_NAME);
  return stub.fetch(c.req.raw);
});

router.get("/door-opener", async (c) => {
  const stub = c.env.PHONEBELL_ACTOR.getByName(PHONEBELL_ACTOR_NAME);
  return stub.fetch(c.req.raw);
});

router.get("/signaling", async (c) => {
  const stub = c.env.PHONEBELL_ACTOR.getByName(PHONEBELL_ACTOR_NAME);
  return stub.fetch(c.req.raw);
});

router.post("/open", async (c) => {
  const token =
    c.req
      .header("authorization")
      ?.trim()
      .match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
  const stub = c.env.PHONEBELL_ACTOR.getByName(PHONEBELL_ACTOR_NAME);
  return toResponse(await stub.openFromBearer(token));
});

export default router;
