import { Hono } from "hono";

import attendance from "./routes/attendance";
import discord from "./routes/discord";
import doorbell from "./routes/doorbell";
import phonebell from "./routes/phonebell";
import sign from "./routes/sign";

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) => {
  return c.json({
    ok: true,
    readme: "Welcome to the Purdue Hackers API!",
    version: 3,
  });
});

app.route("/attendance", attendance);
app.route("/discord", discord);
app.route("/doorbell", doorbell);
app.route("/phonebell", phonebell);
app.route("/sign", sign);

export default app;
