import { EventEmitter } from 'events';

export declare interface WorkerEmitter<TOutput, TData, TError> {
  on(event: 'error', listener: (err: TError) => void): this;
  on(event: 'data', listener: (data: TData) => void): this;
  on(event: 'complete', listener: (data: TOutput) => void): this;
}

export class WorkerEmitter<TOutput, TData, TError> extends EventEmitter {}
