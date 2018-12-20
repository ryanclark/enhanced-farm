export class TimeoutError extends Error {
  constructor(message?: string) {
    super(message);

    Error.captureStackTrace(this, TimeoutError);
  }
}
