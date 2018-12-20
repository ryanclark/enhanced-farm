import { cpus } from 'os';

import { Farm, FarmOptions } from './Farm';

type Params<T> = T extends (...args: infer U) => any ? U : any;

export { WorkerContext } from './Farm';
export { MaxConcurrentCallsError } from './MaxConcurrentCallsError';
export { ProcessTerminatedError } from './ProcessTerminatedError';
export { TimeoutError } from './TimeoutError';

export function createFarm<
  TMethod extends (...args: any[]) => any,
  TOutput = any,
  TData = any,
  TError = Error
>(workerPath: string, options: Partial<FarmOptions> = {}) {
  const defaultOptions: FarmOptions = {
    autoStart: false,
    maxCallsPerWorker: Infinity,
    maxCallTime: Infinity,
    maxConcurrentWorkers: cpus().length,
    maxConcurrentCallsPerWorker: 10,
    maxConcurrentCalls: Infinity,
    maxRetries: Infinity,
  };

  return new Farm<Params<TMethod>, TOutput, TData, TError>(workerPath, {
    ...defaultOptions,
    ...options,
  });
}
