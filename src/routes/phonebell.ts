import { Elysia } from "elysia";
import { env } from "../env";

const KNOWN_NUMBERS = [
  "0", // Operator
  "7", // Test Number
  "349", // "Fiz"
  "4225", // "Hack"
  "34643664", // "Dingdong"
  "8675309", // the funny
  "47932786463439686262438634258447455587853896846",
];

type PhoneStatus =
  | "idle"
  | "awaiting_user"
  | "calling_others"
  | "in_call"
  | "awaiting_others";

type Sound = "None" | "Dialtone" | "Ringback" | "Hangup";
type PhoneType = "Inside" | "Outside";

interface OutgoingMessage {
  type: string;
  [key: string]: unknown;
}

interface PhoneConnection {
  ws: any;
  phoneType: PhoneType;
  authenticated: boolean;
  status: PhoneStatus;
  hookState: boolean;
  dialedNumber: string;
  inCall: boolean;
  pingInterval?: ReturnType<typeof setInterval>;
}

// --- Global State ---
const phoneConnections = new Map<string, PhoneConnection>();
let ringerState = false;

// --- Signaling State ---
const signalingClients = new Map<
  string,
  { ws: any; pingInterval: ReturnType<typeof setInterval> }
>();

// --- Phone Helper Functions ---

function sendToPhone(conn: PhoneConnection, message: OutgoingMessage) {
  console.log(
    `[${conn.phoneType}] Phone Socket tx: ${JSON.stringify(message)}`
  );
  conn.ws.send(JSON.stringify(message));
}

function getActiveCallers(): number {
  let count = 0;
  for (const conn of phoneConnections.values()) {
    if (conn.inCall) count++;
  }
  return count;
}

function broadcastStateChange() {
  for (const conn of phoneConnections.values()) {
    if (!conn.authenticated) continue;
    updatePhoneFromState(conn);
  }
}

function updatePhoneFromState(conn: PhoneConnection) {
  const activeCallers = getActiveCallers();

  switch (conn.status) {
    case "idle":
      if (conn.hookState) {
        sendToPhone(conn, { type: "Ring", state: ringerState });
      }
      break;

    case "calling_others":
      if (!conn.hookState && activeCallers > 1) {
        conn.status = "in_call";
        sendToPhone(conn, { type: "PlaySound", sound: "None" });
        sendToPhone(conn, { type: "Mute", state: false });
        sendToPhone(conn, { type: "Ring", state: false });
      }
      break;

    case "in_call":
      if (!conn.hookState && activeCallers === 1 && !ringerState) {
        conn.status = "awaiting_others";
        sendToPhone(conn, { type: "PlaySound", sound: "Hangup" });
      }
      break;

    case "awaiting_others":
      if (!conn.hookState && activeCallers > 1) {
        conn.status = "in_call";
        sendToPhone(conn, { type: "PlaySound", sound: "None" });
        sendToPhone(conn, { type: "Mute", state: false });
        sendToPhone(conn, { type: "Ring", state: false });
      }
      break;
  }
}

function handleDial(conn: PhoneConnection, number: string) {
  console.log(
    `[${conn.phoneType}] Dial handler: status=${conn.status}, hook=${conn.hookState}, dialed_so_far='${conn.dialedNumber}', number='${number}'`
  );

  switch (conn.status) {
    case "idle": {
      conn.dialedNumber += number;

      let exactMatch = KNOWN_NUMBERS.includes(conn.dialedNumber);

      if (!exactMatch) {
        const isValidPrefix = KNOWN_NUMBERS.some((n) =>
          n.startsWith(conn.dialedNumber)
        );
        if (!isValidPrefix) {
          conn.dialedNumber = "0";
          exactMatch = true;
        } else {
          return; // Still typing, wait for more digits
        }
      }

      if (exactMatch) {
        if (conn.hookState) {
          // Phone is on-hook, await user to pick up
          conn.status = "awaiting_user";
          sendToPhone(conn, { type: "Ring", state: true });
        } else {
          // Phone is off-hook, start calling
          conn.status = "calling_others";
          sendToPhone(conn, { type: "PlaySound", sound: "Ringback" });
          sendToPhone(conn, { type: "Mute", state: false });

          conn.inCall = true;

          if (getActiveCallers() <= 1) {
            ringerState = true;
          }

          broadcastStateChange();
        }
      }
      break;
    }

    case "in_call": {
      if (conn.phoneType === "Inside" && number === "0") {
        // TODO: Tell door opener to open
      }
      break;
    }
  }
}

function handleHook(conn: PhoneConnection, state: boolean) {
  conn.hookState = state;
  console.log(
    `[${conn.phoneType}] Hook handler: status=${conn.status}, hook_state=${state}`
  );

  if (!state) {
    // User picked up the phone
    const callGoing =
      Array.from(phoneConnections.values()).filter((c) => c.inCall).length > 0;
    console.log(
      `[${conn.phoneType}] Hook pickup: call_going=${callGoing}`
    );

    if (callGoing) {
      // Join existing call
      sendToPhone(conn, { type: "Mute", state: false });
      sendToPhone(conn, { type: "Ring", state: false });
      sendToPhone(conn, { type: "PlaySound", sound: "None" });

      conn.inCall = true;
      ringerState = false;
      conn.status = "in_call";

      broadcastStateChange();
    } else {
      switch (conn.status) {
        case "idle":
          sendToPhone(conn, { type: "Ring", state: false });
          sendToPhone(conn, { type: "Mute", state: true });
          sendToPhone(conn, { type: "PlaySound", sound: "Dialtone" });
          break;

        case "awaiting_user":
          sendToPhone(conn, { type: "Ring", state: false });
          sendToPhone(conn, { type: "Mute", state: false });
          sendToPhone(conn, { type: "PlaySound", sound: "Ringback" });

          conn.status = "calling_others";
          conn.inCall = true;

          if (getActiveCallers() <= 1) {
            ringerState = true;
          }

          broadcastStateChange();
          break;

        case "calling_others":
          sendToPhone(conn, { type: "Ring", state: false });
          sendToPhone(conn, { type: "Mute", state: false });
          sendToPhone(conn, { type: "PlaySound", sound: "Ringback" });
          break;

        case "in_call":
          sendToPhone(conn, { type: "Ring", state: false });
          sendToPhone(conn, { type: "Mute", state: false });
          sendToPhone(conn, { type: "PlaySound", sound: "None" });
          break;

        case "awaiting_others":
          sendToPhone(conn, { type: "Ring", state: false });
          sendToPhone(conn, { type: "Mute", state: false });
          sendToPhone(conn, { type: "PlaySound", sound: "Hangup" });
          break;
      }
    }
  } else {
    // User put down the phone
    sendToPhone(conn, { type: "PlaySound", sound: "None" });
    sendToPhone(conn, { type: "Mute", state: true });
    sendToPhone(conn, { type: "Ring", state: false });

    switch (conn.status) {
      case "idle":
      case "awaiting_user":
        conn.dialedNumber = "";
        break;

      case "calling_others":
      case "in_call":
      case "awaiting_others":
        conn.inCall = false;
        ringerState = false;
        broadcastStateChange();
        break;
    }

    conn.status = "idle";
  }
}

function cleanupPhone(id: string) {
  const conn = phoneConnections.get(id);
  if (!conn) return;

  if (conn.pingInterval) clearInterval(conn.pingInterval);

  const wasInCall = conn.inCall;
  phoneConnections.delete(id);

  if (wasInCall) {
    if (getActiveCallers() === 0) {
      ringerState = false;
    }
    broadcastStateChange();
  }

  console.log(`[${conn.phoneType}] Phone disconnected, cleaned up state`);
}

// --- Router ---

function createPhoneWsHandler(phoneType: PhoneType) {
  return {
    open(ws: any) {
      phoneConnections.set(ws.id, {
        ws,
        phoneType,
        authenticated: false,
        status: "idle" as PhoneStatus,
        hookState: true,
        dialedNumber: "",
        inCall: false,
      });
      console.log(`[${phoneType}] phone waiting for auth...`);
    },
    message(ws: any, data: any) {
      console.log(`[${phoneType}] RAW WS message: type=${typeof data} data=${String(data).slice(0, 200)}`);
      const conn = phoneConnections.get(ws.id);
      if (!conn) return;

      if (!conn.authenticated) {
        const key = String(data).trim();
        if (key !== env.PHONE_API_KEY) {
          console.log(`[${phoneType}] auth rejected`);
          ws.close();
          return;
        }
        conn.authenticated = true;
        console.log(`[${phoneType}] phone connected, let's rock and roll`);

        // Keepalive pings every 5 seconds
        conn.pingInterval = setInterval(() => {
          try {
            ws.raw.ping();
          } catch {}
        }, 5000);

        // Send initial state to this phone
        broadcastStateChange();
        return;
      }

      let message: any;
      try {
        message = JSON.parse(String(data));
      } catch {
        return;
      }

      console.log(
        `[${phoneType}] Phone Socket rx: ${JSON.stringify(message)}`
      );

      if (message.type === "Dial" && typeof message.number === "string") {
        handleDial(conn, message.number);
      } else if (
        message.type === "Hook" &&
        typeof message.state === "boolean"
      ) {
        handleHook(conn, message.state);
      }
    },
    close(ws: any) {
      cleanupPhone(ws.id);
    },
  };
}

const router = new Elysia();

router.group("/phonebell", (app) =>
  app
    .ws("/outside", createPhoneWsHandler("Outside"))
    .ws("/inside", createPhoneWsHandler("Inside"))
    .ws("/signaling", {
      open(ws: any) {
        console.log(`[Signaling] client connected: ${ws.id}`);

        // Send initial ping (client expects this handshake)
        try {
          ws.raw.ping(new Uint8Array([1, 2, 3]));
        } catch {}

        const pingInterval = setInterval(() => {
          try {
            ws.raw.ping();
          } catch {}
        }, 5000);

        signalingClients.set(ws.id, { ws, pingInterval });
      },
      message(ws: any, data: any) {
        const text = String(data);
        console.log(`[Signaling] rx from ${ws.id}: ${text.slice(0, 100)}`);
        // Relay to all other signaling clients
        let relayCount = 0;
        for (const [id, client] of signalingClients) {
          if (id !== ws.id) {
            client.ws.send(text);
            relayCount++;
          }
        }
        console.log(`[Signaling] relayed to ${relayCount} clients`);
      },
      close(ws: any) {
        const client = signalingClients.get(ws.id);
        if (client) {
          clearInterval(client.pingInterval);
          signalingClients.delete(ws.id);
        }
        console.log(`[Signaling] client disconnected: ${ws.id}`);
      },
    })
);

export default router;
