import { WorkerContext } from 'enhanced-farm';

export function worker(this: WorkerContext<number, string>, index: number) {
  this.send('data');

  setTimeout(() => this.done(index), 1000);
}
