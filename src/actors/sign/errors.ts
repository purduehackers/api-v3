export class SignDeviceRequestTimeoutError extends Error {
  constructor() {
    super("Device request timed out");
  }
}
