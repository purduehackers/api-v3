import * as Sentry from "@sentry/cloudflare";
import app from "./server";

import Discord from "./actors/discord/index";
import Doorbell from "./actors/doorbell/index";
import Phonebell from "./actors/phonebell/index";
import Sign from "./actors/sign/index";

export { Discord, Doorbell, Phonebell, Sign };

export default Sentry.withSentry(
  (env) => ({
    dsn: "https://d91cbfdeb0b0284d6ad54473db3e8fd4@o4510744753405952.ingest.us.sentry.io/4511249050959872",

    // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
    tracesSampleRate: 1,

    // Enable logs to be sent to Sentry
    enableLogs: true,
  }),
  {
    fetch: app.fetch,
  } satisfies ExportedHandler<Env>,
);
