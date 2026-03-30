export enum PhoneStatus {
  Idle = "idle",
  AwaitingUser = "awaiting_user",
  CallingOthers = "calling_others",
  InCall = "in_call",
  AwaitingOthers = "awaiting_others",
}

export enum PhoneType {
  Inside = "Inside",
  Outside = "Outside",
}

export enum PhoneSound {
  None = "None",
  Dialtone = "Dialtone",
  Ringback = "Ringback",
  Hangup = "Hangup",
  DoorOpen = "DoorOpen",
}
