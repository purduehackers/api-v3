import { Hono } from "hono";

import { DOORBELL_ACTOR_NAME } from "../../actors/doorbell/constants";
import { toResponse } from "../../lib/http";

const router = new Hono<{ Bindings: Env }>();

router.get("/", async (c) => {
  const stub = c.env.DOORBELL_ACTOR.getByName(DOORBELL_ACTOR_NAME);
  return stub.fetch(c.req.raw);
});

router.get("/status", async (c) => {
  const stub = c.env.DOORBELL_ACTOR.getByName(DOORBELL_ACTOR_NAME);
  return toResponse(await stub.getStatus());
});

router.post("/ring", async (c) => {
  const stub = c.env.DOORBELL_ACTOR.getByName(DOORBELL_ACTOR_NAME);
  return toResponse(await stub.ring());
});

export default router;
