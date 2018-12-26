let worker: any;

process.on('message', data => {
  if (!worker) {
    worker = require(data.workerPath);

    if (data.exportedMethodName) {
      worker = worker[data.exportedMethodName];
    }

    return;
  }

  if (data === 'die') {
    process.exit(0);
  }

  if (typeof worker !== 'function') {
    return console.error('No such method');
  }

  const { index, childId, args } = data;

  const context = {
    complete(data: any) {
      process.send({ index, childId, data, type: 'complete' });
    },
    error(data: any) {
      process.send({ index, childId, data, type: 'error' });
    },
    send(data: any) {
      process.send({ index, childId, data, type: 'data' });
    },
    exit() {
      process.send({ index, childId, type: 'exit' });
    },
  };

  worker.apply(context, args);
});
