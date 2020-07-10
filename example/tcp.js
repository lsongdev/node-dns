const { DoT } = require('..');

const resolve = DoT({
  dns: '1.1.1.1'
});

(async () => {
  const response = await resolve('google.com')
  console.log(response.answers);
})();