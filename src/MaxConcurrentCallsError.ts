export class MaxConcurrentCallsError extends Error {
  constructor(message?: string) {
    super(message);

    Error.captureStackTrace(this, MaxConcurrentCallsError);
  }
}
