module.exports = function (index: number) {
  this.send('Sending back data');
  setTimeout(() => this.send('Sending back more data'), 2500);

  setTimeout(() => this.done(index), 5000);
};
