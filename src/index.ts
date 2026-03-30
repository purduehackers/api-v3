import app from "./server";

import Discord from "./actors/discord/index";
import Doorbell from "./actors/doorbell/index";
import Phonebell from "./actors/phonebell/index";
import Sign from "./actors/sign/index";

export { Discord, Doorbell, Phonebell, Sign };

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;
