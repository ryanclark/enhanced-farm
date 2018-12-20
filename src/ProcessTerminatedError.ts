export class ProcessTerminatedError extends Error {
  constructor(message?: string) {
    super(message);

    Error.captureStackTrace(this, ProcessTerminatedError);
  }
}
