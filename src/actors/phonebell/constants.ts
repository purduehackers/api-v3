export const PHONEBELL_ACTOR_NAME = "site:default:phonebell";
export const PHONEBELL_PATHS = {
  outside: "/phonebell/outside",
  inside: "/phonebell/inside",
  doorOpener: "/phonebell/door-opener",
  signaling: "/phonebell/signaling",
} as const;

export const PHONEBELL_SOCKET_TAGS = {
  phone: "phone",
  inside: "phone:inside",
  outside: "phone:outside",
  doorOpener: "door-opener",
  signaling: "signaling",
} as const;

export const PHONEBELL_STORAGE_KEY = "ringerState";

export const KNOWN_NUMBERS: readonly string[] = [
  "0",
  "7",
  "349",
  "4225",
  "34643664",
  "8675309",
  "47932786463439686262438634258447455587853896846",
];
