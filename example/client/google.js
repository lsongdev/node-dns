const { GoogleClient } = require('../..');

(async() => {
  const resolve = GoogleClient();
  const response = await resolve('google.com');
  console.log(response);
})();
