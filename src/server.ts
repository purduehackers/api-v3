import { Elysia } from "elysia";

import events from "./routes/events";
import doorbell from "./routes/doorbell";

const app = new Elysia();

app.get("/", () => {
  return JSON.stringify({
    ok: true,
    readme: "Welcome to the Purdue Hackers API!",
  });
});

// app.use(events);
app.use(doorbell);

export default app;
export type App = typeof app;
