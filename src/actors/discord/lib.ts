import { DiscordSocketRole } from "./enums";
import type { DiscordSocketAttachment } from "./types";

export function isBotAttachment(
  attachment: unknown,
): attachment is Extract<DiscordSocketAttachment, { role: DiscordSocketRole.Bot }> {
  return (
    typeof attachment === "object" &&
    attachment !== null &&
    "role" in attachment &&
    attachment.role === DiscordSocketRole.Bot
  );
}
