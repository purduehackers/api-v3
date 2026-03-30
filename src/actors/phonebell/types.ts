import type { PhoneStatus, PhoneType } from "./enums";

export type PhoneConnectionAttachment = {
  role: "phone";
  phoneType: PhoneType;
  authenticated: boolean;
  status: PhoneStatus;
  hookState: boolean;
  dialedNumber: string;
  inCall: boolean;
};

export type PhoneConnection = {
  ws: WebSocket;
  attachment: PhoneConnectionAttachment;
};

export type DoorOpenerAttachment = {
  role: "door-opener";
  authenticated: boolean;
};
