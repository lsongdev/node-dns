const { GoogleClient: resolve } = require('../..');

(async () => {

  const response = await resolve('google.com');
  console.log(response);

})();
