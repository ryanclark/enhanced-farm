import { WorkerContext } from 'enhanced-farm';

module.exports = function (this: WorkerContext<number, string>, index: number) {
  this.send('data');

  setTimeout(() => this.done(index), 1000);
};
