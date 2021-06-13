const { TCPClient } = require('../..');

const resolve = TCPClient({
  dns: '1.1.1.1',
});

(async() => {
  const response = await resolve('google.com');
  console.log(response.answers);
})();
