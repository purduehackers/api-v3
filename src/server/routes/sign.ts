import { Hono } from "hono";

import { SIGN_ACTOR_NAME } from "../../actors/sign/constants";
import { toResponse } from "../../lib/http";

const router = new Hono<{ Bindings: Env }>();

router.post("/provision", async (c) => {
  const stub = c.env.SIGN_ACTOR.getByName(SIGN_ACTOR_NAME);
  return toResponse(await stub.provision());
});

router.get("/devices", async (c) => {
  const stub = c.env.SIGN_ACTOR.getByName(SIGN_ACTOR_NAME);
  return toResponse(await stub.listDevices());
});

router.get("/:device/wifi", async (c) => {
  const stub = c.env.SIGN_ACTOR.getByName(SIGN_ACTOR_NAME);
  return toResponse(await stub.getWifi(c.req.param("device")!));
});

router.put("/:device/wifi", async (c) => {
  const stub = c.env.SIGN_ACTOR.getByName(SIGN_ACTOR_NAME);
  return toResponse(
    await stub.setWifi(c.req.param("device")!, await c.req.text()),
  );
});

router.get("/ws", async (c) => {
  const stub = c.env.SIGN_ACTOR.getByName(SIGN_ACTOR_NAME);
  return stub.fetch(c.req.raw);
});

export default router;
