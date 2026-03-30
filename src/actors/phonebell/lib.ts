import { KNOWN_NUMBERS } from "./constants";
import type { DoorOpenerAttachment, PhoneConnectionAttachment } from "./types";

export function isPhoneAttachment(attachment: unknown): attachment is PhoneConnectionAttachment {
  return (
    typeof attachment === "object" &&
    attachment !== null &&
    "role" in attachment &&
    attachment.role === "phone"
  );
}

export function isDoorOpenerAttachment(attachment: unknown): attachment is DoorOpenerAttachment {
  return (
    typeof attachment === "object" &&
    attachment !== null &&
    "role" in attachment &&
    attachment.role === "door-opener"
  );
}

export function isKnownNumber(dialedNumber: string): boolean {
  return KNOWN_NUMBERS.includes(dialedNumber);
}

export function hasKnownNumberPrefix(dialedNumber: string): boolean {
  return KNOWN_NUMBERS.some((value) => value.startsWith(dialedNumber));
}
