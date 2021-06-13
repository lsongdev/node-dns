const { TCPClient } = require('../..');

const resolve = TCPClient();

(async() => {
  try {
    const response = await resolve('google.com');
    console.log(response.answers);
  } catch (error) {
    console.log(error);
  }
})();
