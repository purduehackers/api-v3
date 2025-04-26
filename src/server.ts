import { Elysia } from "elysia";

const app = new Elysia();

app.get("/", () => {
  return JSON.stringify({
    ok: true,
    readme: "Welcome to the Purdue Hackers API!",
  });
});

export default app;
export type App = typeof app;
