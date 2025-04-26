import { Elysia } from "elysia";

import { env } from "../env";

const sanityHost = new URL(`https://${env.SANITY_PROJECT_ID}.apicdn.sanity.io`);
const sanityAPIEndpointURL = new URL(
  "/v2023-02-16/data/query/production",
  sanityHost,
);

const router = new Elysia();
router.group("/events", (app) => {
  app.get("/", async ({ query: { groq } }) => {
    if (!groq) {
      return new Response("Missing `groq` query parameter", { status: 400 });
    }

    const sanityQuery = new URL(sanityAPIEndpointURL);
    sanityQuery.searchParams.set("query", encodeURIComponent(groq));

    try {
      const res = await fetch(sanityQuery.toString(), {
        headers: {
          Authorization: `Bearer ${env.SANITY_TOKEN}`,
        },
      });

      const json = await res.json();
      if (json && "result" in json) {
        return json.result;
      } else {
        return new Response("Not found", { status: 404 });
      }
    } catch (err) {
      return new Response("Error fetching from Sanity", { status: 500 });
    }
  });

  return app;
});

export default router;
