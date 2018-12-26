<h1 align="center">
  <p align="center">enhanced-farm</p>
</h1>

A library to distribute processing tasks to child workers concurrently. Heavily based on [worker-farm](https://github.com/rvagg/node-worker-farm). Written in TypeScript.

## Getting Started

Install `enhanced-farm` using [`yarn`](https://yarnpkg.com/en/package/enhanced-farm):

```bash
yarn add enhanced-farm
```

Or via [`npm`](https://www.npmjs.com/package/enhanced-farm):

```bash
npm install enhanced-farm
```

## Use Case

You can use this module to create child processes and evenly distribute your processing tasks between them. Your processing tasks can also then send back data whilst they are running, for example, progress data when parallel compiling webpack.

## API

First of all, you need to create a worker farm. You specify the path to the worker that contains the method you want to repeatedly (and concurrently) call and process in child processes.

#### createFarm(workerPath[, options])

Creates a new `Farm` instance.

### Farm

#### runWorker([...args]): EventEmitter

Schedule your worker to process a task with the given arguments when it can.

This returns an `EventEmitter` instance for your task. You can listen for `error`, `started`, `data` or `complete`.

```js
const worker = runWorker();

worker.on('error', (err) => console.error(err));
worker.on('started', (exit) => exit());
worker.on('data', (data) => console.log(data));
worker.on('complete', (data) => console.log(data));
```

If you listen for the `started` event, you'll receive a callback that you can use to end the worker outside of the worker itself.

#### end()

Once you've ran all your tasks, you'll want to end your farm and kill all left over child processes, otherwise they'll still be running, awaiting a new task.

Normally you'd compare the amount of tasks run (when you call `runWorker`) vs. the amount of `complete` or `error` events you've received from your workers in total. Each worker will only ever emit the `complete` or `error` events once, but can emit the `data` event as many times as needed.


### Creating a worker

Your worker is just a function that is called whenever there is a spare child process to run it. You'll need to export it via `module.exports` unless you specify the exported method name in the options.

The worker function is called with four methods on it's `this` context.

#### error(err)

Report an error and stop processing.

#### send(data)

Send data back to the parent process. You can call this as many times as you want before the task has completed.

#### complete(data)

Complete the task and pass data back. This will then free the child process up to run the next task.

#### exit()

End the process immediately. Useful when listening for `SIGINT` events.

```javascript
module.exports = function() {
  this.send('send data back!');
  
  setTimeout(() => this.complete('complete the task with this data'));
};
```

## Options

These are the options and their default values that you can pass through to `createFarm`.

```js
{
  autoStart: false,
  exportedMethodName: null,
  maxCallsPerWorker: Infinity,
  maxCallTime: Infinity,
  maxConcurrentWorkers: require('os').cpus().length,
  maxConcurrentCallsPerWorker: 10,
  maxConcurrentCalls: Infinity,
  maxRetries: Infinity,
}
```

#### autoStart: boolean

If set to `true`, once creating the farm, all child processes will be created immediately (up to the amount specified by the `maxConcurrentCallsPerWorker` option). If not, they are created once `runWorker` is called.

#### exportedMethodName: string

The name of the exported method from your worker file if you are not using `module.exports`.

#### maxCallsPerWorker: number

The maximum number of calls a worker can make before it is killed and replaced.

#### maxCallTime: number

The maximum time that your worker can run for.

#### maxConcurrentWorkers: number

The maximum number of workers that can exist concurrently. Normally it's best to match this with the number of cores the processor has.

#### maxConcurrentCallsPerWorker: number

The maximum number of calls a worker can concurrently handle.

#### maxConcurrentCalls: number

The maximum number of calls the entire farm can concurrently handle.

#### maxRetries: number

The number of times to retry a task if it fails.

## TypeScript Usage

#### Basic Usage

##### index.ts
```typescript
import { createFarm } from 'enhanced-farm';

const farm = createFarm(require.resolve('./worker'));

for (let i = 0; i < 10; i++) {
  const worker = farm.runWorker(i);

  worker.on('error', (error) => console.error(error));
  worker.on('data', (data) => console.log('data received', data));
  
  worker.on('complete', (data) => {
    if (data === 9) {
      farm.end();
    }
  });
}
```

Note that you'll need to make sure your `tsconfig.json` is set to include all `.ts` files (when using the `include` option) or you'll need to specify every worker file in the `files` array to ensure they're outputted.

##### worker.ts
```typescript
function worker(index: number) {
  this.send('send back some data');

  setTimeout(() => this.done(index), 2000);
}

module.exports = worker;
```

### Advanced Usage

You can strongly type your worker function to ensure the correct arguments are passed to the workers.

```typescript
const farm = createFarm<typeof import('./worker')>(require.resolve('./worker'));
```

Will infer the types from the worker when you then call `runWorker`.

```typescript
farm.runWorker('string'); // type error
farm.runWorker(1); // all good
```

To specify the types of data, pass them through after the function type generic.

```typescript
type WorkerOutput = number; // or an interface
type WorkerData = string; // or an interface

createFarm<typeof import('./worker'), WorkerOutput, WorkerData, Error>(require.resolve('./worker'));
```

```typescript
const worker = farm.runWorker(i);
  
worker.on('error', (error) => console.error(error)); // error inferred to Error
worker.on('data', (data) => console.log('data received', data)); // data inferred to WorkerData

worker.on('complete', (data) => console.log('completed!', data)); // data inferred to WorkerOutput
```

You can also specify the context in your workers for when you use the `error`, `send` or `complete` methods.

```typescript
import { WorkerContext } from 'enhanced-farm';

function worker(this: WorkerContext<WorkerOutput, WorkerData, Error>, index: number) {
  this.send('send back some data');

  setTimeout(() => this.done(index), 2000);
}

module.exports = worker;
```

This will then type guard those methods.

### Using a named export

You can also use a named export by specifying the name in the options. If you're type guarding your code, you'll need to change it a little.

##### index.ts
```typescript
createFarm<typeof import('./worker').Worker>(require.resolve('./worker'), { exportedMethodName: 'Worker' });
```

##### worker.ts

```typescript
import { WorkerContext } from 'enhanced-farm';

export function worker(this: WorkerContext<WorkerOutput, WorkerData, Error>, index: number) {
  this.send('send back some data');

  setTimeout(() => this.done(index), 2000);
}
```

## JavaScript Usage

##### index.js

```js
const { createFarm } = require('enhanced-farm');

const farm = createFarm(require.resolve('./worker'));

for (let i = 0; i < 10; i++) {
  const worker = farm.runWorker(i);
  
  worker.on('error', (error) => console.error(error));
  worker.on('data', (data) => console.log('data received', data));
  
  worker.on('complete', (data) => {
    if (data === 9) {
      farm.end();
    }
  });
}
```

##### worker.js

```js
function worker(index) {
  this.send('send back some data');

  setTimeout(() => this.done(index), 2000);
}

module.exports = worker;
```

## Credits

This module was heavily inspired and created off of the work of [worker-farm](https://github.com/rvagg/node-worker-farm).
