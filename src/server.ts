import { Elysia } from "elysia";

import events from "./routes/events";

const app = new Elysia();

app.get("/", () => {
  return JSON.stringify({
    ok: true,
    readme: "Welcome to the Purdue Hackers API!",
  });
});

app.use(events);

export default app;
export type App = typeof app;
