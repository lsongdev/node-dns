const { DOHClient } = require('../..');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const resolve = DOHClient({
  dns: '1.1.1.1',
});

(async() => {
  const response = await resolve('google.com');
  console.log(response.answers);
})();
