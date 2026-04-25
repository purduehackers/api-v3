import * as Sentry from "@sentry/cloudflare";

import { PhoneIncomingMessageSchema } from "../../protocol/phonebell";
import { PhoneSound, PhoneStatus, PhoneType } from "./enums";
import { hasKnownNumberPrefix, isKnownNumber } from "./lib";
import { PhonebellSocketCoordinator } from "./socket-coordinator";
import type { PhoneConnectionAttachment } from "./types";


export class PhonebellStateMachine {
  constructor(
    private readonly coordinator: PhonebellSocketCoordinator,
    private readonly env: Env,
    private readonly getRingerState: () => boolean,
    private readonly setRingerState: (state: boolean) => Promise<void>,
  ) {}

  async handlePhoneWebSocketClose(
    ws: WebSocket,
    attachment: PhoneConnectionAttachment,
  ): Promise<void> {
    if (!attachment.authenticated || !attachment.inCall) {
      return;
    }

    if (this.coordinator.getActiveCallers(ws) === 0) {
      await this.setRingerState(false);
    }

    this.broadcastStateChange(ws);
  }

  async handlePhoneWebSocketMessage(
    ws: WebSocket,
    attachment: PhoneConnectionAttachment,
    message: string | ArrayBuffer,
  ): Promise<void> {
    const text = typeof message === "string" ? message : new TextDecoder().decode(message);

    if (!attachment.authenticated) {
      const key = text.trim();
      if (key !== this.env.PHONE_API_KEY) {
        ws.close(1008, "Invalid API key");
        return;
      }

      attachment.authenticated = true;
      ws.serializeAttachment(attachment);
      this.broadcastStateChange();
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return;
    }

    const validation = PhoneIncomingMessageSchema.safeParse(parsed);
    if (!validation.success) {
      return;
    }

    if (validation.data.type === "Dial") {
      await this.handleDial(ws, attachment, validation.data.number);
      return;
    }

    await this.handleHook(ws, attachment, validation.data.state);
  }

  private sendConnectedCallState(ws: WebSocket): void {
    ws.send(JSON.stringify({ type: "PlaySound", sound: PhoneSound.None }));
    ws.send(JSON.stringify({ type: "Mute", state: false }));
    ws.send(JSON.stringify({ type: "Ring", state: false }));
  }

  private sendJoinedCallState(ws: WebSocket): void {
    ws.send(JSON.stringify({ type: "Mute", state: false }));
    ws.send(JSON.stringify({ type: "Ring", state: false }));
    ws.send(JSON.stringify({ type: "PlaySound", sound: PhoneSound.None }));
  }

  private sendOffHookState(ws: WebSocket, sound: PhoneSound, muted: boolean): void {
    ws.send(JSON.stringify({ type: "Ring", state: false }));
    ws.send(JSON.stringify({ type: "Mute", state: muted }));
    ws.send(JSON.stringify({ type: "PlaySound", sound }));
  }

  private sendOnHookState(ws: WebSocket): void {
    ws.send(JSON.stringify({ type: "PlaySound", sound: PhoneSound.None }));
    ws.send(JSON.stringify({ type: "Mute", state: true }));
    ws.send(JSON.stringify({ type: "Ring", state: false }));
  }

  private connectPhoneToCall(ws: WebSocket, attachment: PhoneConnectionAttachment): void {
    attachment.status = PhoneStatus.InCall;
    ws.serializeAttachment(attachment);
    this.sendConnectedCallState(ws);
  }

  private async markCallingOthers(
    ws: WebSocket,
    attachment: PhoneConnectionAttachment,
  ): Promise<void> {
    attachment.status = PhoneStatus.CallingOthers;
    attachment.inCall = true;
    ws.serializeAttachment(attachment);

    if (this.coordinator.getActiveCallers() <= 1) {
      await this.setRingerState(true);
    }

    this.broadcastStateChange();
  }

  private async joinActiveCall(
    ws: WebSocket,
    attachment: PhoneConnectionAttachment,
  ): Promise<void> {
    this.sendJoinedCallState(ws);

    attachment.inCall = true;
    attachment.status = PhoneStatus.InCall;
    await this.setRingerState(false);
    ws.serializeAttachment(attachment);
    this.broadcastStateChange();
  }

  private async leaveCall(ws: WebSocket, attachment: PhoneConnectionAttachment): Promise<void> {
    attachment.inCall = false;
    ws.serializeAttachment(attachment);
    await this.setRingerState(false);
    this.broadcastStateChange();
  }

  private broadcastStateChange(exclude?: WebSocket): void {
    for (const { ws, attachment } of this.coordinator.getPhoneConnections(exclude)) {
      if (!attachment.authenticated) {
        continue;
      }

      this.updatePhoneFromState(ws, attachment);
    }
  }

  private updatePhoneFromState(ws: WebSocket, attachment: PhoneConnectionAttachment): void {
    const activeCallers = this.coordinator.getActiveCallers();

    switch (attachment.status) {
      case PhoneStatus.Idle:
        if (attachment.hookState) {
          ws.send(JSON.stringify({ type: "Ring", state: this.getRingerState() }));
        }
        break;
      case PhoneStatus.CallingOthers:
        if (!attachment.hookState && activeCallers > 1) {
          this.connectPhoneToCall(ws, attachment);
        }
        break;
      case PhoneStatus.InCall:
        if (!attachment.hookState && activeCallers === 1 && !this.getRingerState()) {
          attachment.status = PhoneStatus.AwaitingOthers;
          ws.serializeAttachment(attachment);
          ws.send(JSON.stringify({ type: "PlaySound", sound: PhoneSound.Hangup }));
        }
        break;
      case PhoneStatus.AwaitingOthers:
        if (!attachment.hookState && activeCallers > 1) {
          this.connectPhoneToCall(ws, attachment);
        }
        break;
      case PhoneStatus.AwaitingUser:
        break;
    }
  }

  private notifyInCallPhones(sound: PhoneSound): void {
    for (const { ws, attachment } of this.coordinator.getPhoneConnections()) {
      if (attachment.authenticated && attachment.inCall) {
        ws.send(JSON.stringify({ type: "PlaySound", sound }));
      }
    }
  }

  private async handleDial(
    ws: WebSocket,
    attachment: PhoneConnectionAttachment,
    number: string,
  ): Promise<void> {
    switch (attachment.status) {
      case PhoneStatus.Idle: {
        attachment.dialedNumber += number;
        ws.serializeAttachment(attachment);

        let exactMatch = isKnownNumber(attachment.dialedNumber);
        if (!exactMatch) {
          if (!hasKnownNumberPrefix(attachment.dialedNumber)) {
            attachment.dialedNumber = "0";
            ws.serializeAttachment(attachment);
            exactMatch = true;
          } else {
            return;
          }
        }

        if (!exactMatch) {
          return;
        }

        if (attachment.hookState) {
          attachment.status = PhoneStatus.AwaitingUser;
          ws.serializeAttachment(attachment);
          ws.send(JSON.stringify({ type: "Ring", state: true }));
          return;
        }

        ws.send(JSON.stringify({ type: "PlaySound", sound: PhoneSound.Ringback }));
        ws.send(JSON.stringify({ type: "Mute", state: false }));
        await this.markCallingOthers(ws, attachment);
        break;
      }
      case PhoneStatus.InCall:
        if (attachment.phoneType === PhoneType.Inside && number === "0") {
          try {
            this.coordinator.triggerDoorOpener();
            this.notifyInCallPhones(PhoneSound.DoorOpen);
          } catch (err) {
            Sentry.captureException(err);
            this.notifyInCallPhones(PhoneSound.DoorFailed);
          }
        }
        break;
      case PhoneStatus.AwaitingOthers:
      case PhoneStatus.AwaitingUser:
      case PhoneStatus.CallingOthers:
        break;
    }
  }

  private async handleHook(
    ws: WebSocket,
    attachment: PhoneConnectionAttachment,
    state: boolean,
  ): Promise<void> {
    attachment.hookState = state;
    ws.serializeAttachment(attachment);

    if (!state) {
      if (this.coordinator.getActiveCallers() > 0) {
        await this.joinActiveCall(ws, attachment);
        return;
      }

      switch (attachment.status) {
        case PhoneStatus.Idle:
          this.sendOffHookState(ws, PhoneSound.Dialtone, true);
          break;
        case PhoneStatus.AwaitingUser:
          this.sendOffHookState(ws, PhoneSound.Ringback, false);
          await this.markCallingOthers(ws, attachment);
          break;
        case PhoneStatus.CallingOthers:
          this.sendOffHookState(ws, PhoneSound.Ringback, false);
          break;
        case PhoneStatus.InCall:
          this.sendOffHookState(ws, PhoneSound.None, false);
          break;
        case PhoneStatus.AwaitingOthers:
          this.sendOffHookState(ws, PhoneSound.Hangup, false);
          break;
      }

      return;
    }

    this.sendOnHookState(ws);

    switch (attachment.status) {
      case PhoneStatus.Idle:
      case PhoneStatus.AwaitingUser:
        attachment.dialedNumber = "";
        break;
      case PhoneStatus.CallingOthers:
      case PhoneStatus.InCall:
      case PhoneStatus.AwaitingOthers:
        await this.leaveCall(ws, attachment);
        break;
    }

    attachment.status = PhoneStatus.Idle;
    ws.serializeAttachment(attachment);
  }
}
