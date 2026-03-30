import type { DiscordSocketRole } from "./enums";

export type DiscordAuthResponse = {
  auth: "complete" | "rejected";
};

export type DiscordSocketAttachment =
  | {
      role: DiscordSocketRole.Bot;
      authenticated: boolean;
    }
  | {
      role: DiscordSocketRole.Dashboard;
    };
