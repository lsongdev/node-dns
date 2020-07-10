const { DoH } = require('..');

const resolve = DoH({
  dns: '1.1.1.1'
});

(async () => {

  const response = await resolve('google.com');
  console.log(response.answers);

})();