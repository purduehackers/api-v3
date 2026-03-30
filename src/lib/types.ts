export type HttpResult<T = unknown> =
  | {
      status: number;
      json: T;
      headers?: HeadersInit;
    }
  | {
      status: number;
      text: string;
      headers?: HeadersInit;
    }
  | {
      status: number;
      headers?: HeadersInit;
    };
