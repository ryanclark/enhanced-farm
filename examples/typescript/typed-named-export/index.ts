import { createFarm } from 'enhanced-farm';

const farm = createFarm<
  typeof import('./worker').worker,
  number,
  string
>(require.resolve('./worker'), { exportedMethodName: 'worker' });

for (let i = 0; i < 10; i++) {
  const worker = farm.runWorker(i);

  worker.on('data', (data) => console.log('received', data));
  worker.on('complete', (result) => {
    console.log(i, result); // they'll be the same

    if (i === 9) {
      farm.end();
    }
  });
}
