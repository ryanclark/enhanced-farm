import { ChildProcess, fork } from 'child_process';
import { EventEmitter } from 'events';

import { MaxConcurrentCallsError } from './MaxConcurrentCallsError';
import { ProcessTerminatedError } from './ProcessTerminatedError';
import { TimeoutError } from './TimeoutError';
import { WorkerEmitter } from './WorkerEmitter';

export interface FarmOptions {
  autoStart: boolean;
  exportedMethodName?: string;
  maxCallsPerWorker: number;
  maxCallTime: number;
  maxConcurrentWorkers: number;
  maxConcurrentCallsPerWorker: number;
  maxConcurrentCalls: number;
  maxRetries: number;
}

export interface WorkerContext<TOutput = any, TData = any, TError = Error> {
  complete: (output: TOutput) => void;
  error: (error: TError) => void;
  send: (data: TData) => void;
  exit: () => void;
}

interface WorkerCall<TParams> {
  args: TParams;
  retries: number;
  timer?: NodeJS.Timer;
  emitter: EventEmitter;
}

interface WorkerProcess<TParams> {
  child: ChildProcess;
  calls: WorkerCall<TParams>[];
  activeCalls: number;
  exitCode: number;
}

interface Data {
  index: number;
  childId: number;
  type?: string;
  data?: any;
}

export declare interface Farm<TParams extends any[], TOutput, TData, TError> {
  on(event: 'error', listener: (err: TError) => void): this;
}

export class Farm<
  TParams extends any[],
  TOutput,
  TData,
  TError
> extends EventEmitter {
  private ending: boolean;

  private activeCalls = 0;
  private activeChildren = 0;

  private callQueue: WorkerCall<TParams>[] = [];

  private childId = -1;
  private children = new Map<number, WorkerProcess<TParams>>();

  private searchStart = -1;

  constructor(private workerPath: string, private options: FarmOptions) {
    super();

    if (options.autoStart) {
      while (this.activeChildren < options.maxConcurrentWorkers) {
        this.startChild();
      }
    }
  }

  private addCall(call: WorkerCall<TParams>) {
    if (this.ending) {
      return this.end();
    }

    this.callQueue.push(call);
    this.processQueue();
  }

  private childKeys() {
    let childIds = [...this.children.keys()];

    if (this.searchStart >= childIds.length - 1) {
      this.searchStart = 0;
    } else {
      this.searchStart += 1;
    }

    const ids = childIds.splice(0, this.searchStart);

    return [...childIds, ...ids];
  }

  private childTimeout(childId: number) {
    const child = this.children.get(childId);

    if (!child || !child.child) {
      return;
    }

    for (const index of child.calls.keys()) {
      this.receive({
        index,
        childId,
        type: 'error',
        data: new TimeoutError('worker call timed out'),
      });
    }

    this.stopChild(childId);
  }

  private onExit(childId: number) {
    setTimeout(() => {
      let doQueue = false;

      const child = this.children.get(childId);

      if (child && child.activeCalls) {
        for (const [index, call] of child.calls.entries()) {
          if (!call) {
            continue;
          }

          if (call.retries >= this.options.maxRetries) {
            this.receive({
              index,
              childId,
              type: 'error',
              data: new ProcessTerminatedError(
                `cancel after ${call.retries} retries`
              ),
            });

            continue;
          }

          call.retries += 1;

          this.callQueue.unshift(call);

          doQueue = true;
        }
      }

      this.stopChild(childId);

      if (doQueue) {
        this.processQueue();
      }
    }, 10);
  }

  private processQueue() {
    if (!this.callQueue.length) {
      return this.ending && this.end();
    }

    if (this.activeChildren < this.options.maxConcurrentWorkers) {
      this.startChild();
    }

    let childKeys: number[];
    let i = 0;

    for (childKeys = this.childKeys(); i < childKeys.length; i++) {
      const childId = childKeys[i];
      const child = this.children.get(childId);

      if (
        child.activeCalls < this.options.maxConcurrentCallsPerWorker &&
        child.calls.length < this.options.maxCallsPerWorker
      ) {
        this.send(childId, this.callQueue.shift());

        if (!this.callQueue.length) {
          return this.ending && this.end();
        }
      }
    }

    if (this.ending) {
      this.end();
    }
  }

  private receive(message: Data) {
    const { childId, data, index, type } = message;

    const child = this.children.get(childId);

    if (!child || !child.child) {
      return console.error('Received message from unknown child');
    }

    const call = child.calls[index];
    if (!call) {
      return console.error('Unknown call from child', message);
    }

    if (this.options.maxCallTime !== Infinity) {
      clearTimeout(call.timer);
    }

    if (type) {
      call.emitter.emit(type, data);
    }

    if (type === 'complete' || type === 'error' || type === 'exit') {
      this.activeCalls -= 1;
      child.activeCalls -= 1;

      delete child.calls[index];
    }

    if (
      child.calls.length >= this.options.maxCallsPerWorker &&
      !child.calls.length
    ) {
      this.stopChild(childId);
    }

    this.processQueue();
  }

  private send(childId: number, call: WorkerCall<TParams>) {
    process.nextTick(() => call.emitter.emit('started', () => this.stopChild(childId)));

    const child = this.children.get(childId);
    const index = child.calls.length;

    child.calls.push(call);

    child.activeCalls += 1;
    this.activeCalls += 1;

    child.child.send({ index, childId, args: call.args });

    if (this.options.maxCallTime !== Infinity) {
      call.timer = setTimeout(
        () => this.childTimeout(childId),
        this.options.maxCallTime
      );
    }
  }

  private startChild() {
    this.childId += 1;

    const id = this.childId;

    const options = {
      execArgv: process.execArgv,
      env: process.env,
      cwd: process.cwd(),
    };

    const child = fork(require.resolve('./Child'), process.argv, options);

    child.send({
      workerPath: this.workerPath,
      exportedMethodName: this.options.exportedMethodName,
    });

    const workerProcess: WorkerProcess<TParams> = {
      child,
      calls: [],
      activeCalls: 0,
      exitCode: null,
    };

    this.children.set(id, workerProcess);

    child.on('message', data => this.receive(data));
    child.once('exit', code => {
      const workerProcess = this.children.get(id);

      this.children.set(id, { ...workerProcess, exitCode: code });

      this.onExit(id);
    });

    this.activeChildren += 1;
  }

  private stopChild(id: number) {
    const child = this.children.get(id);

    if (!child || !child.child || !child.child.connected) {
      return;
    }

    child.child.send('die');

    setTimeout(() => {
      if (child.exitCode === null) {
        child.child.kill('SIGKILL');
      }
    }, 100).unref();

    this.children.delete(id);

    this.activeChildren -= 1;
  }

  end() {
    if (this.ending === false) {
      return;
    }

    this.ending = true;

    for (const [childId, child] of this.children.entries()) {
      if (!child || !child.child) {
        continue;
      }

      if (!child.activeCalls) {
        this.stopChild(childId);
      }
    }
  }

  runWorker(...args: TParams) {
    if (this.activeCalls >= this.options.maxConcurrentCalls) {
      throw new MaxConcurrentCallsError(
        `Too many concurrent calls (${this.activeCalls})`
      );
    }

    const emitter = new WorkerEmitter<TOutput, TData, TError>();

    this.addCall({ args, retries: 0, emitter });

    return emitter;
  }
}
