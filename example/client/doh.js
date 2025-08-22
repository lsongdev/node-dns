const { DOHClient } = require('../..');

// process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// const resolve = DOHClient({
//   dns: '1.1.1.1',
// });

// (async() => {
//   const response = await resolve('google.com');
//   console.log(response.answers);
// })();

// import DNS2 from 'dns2';

// DOHClient({
//   dns: 'h2://ada.openbld.net',
// })('cdnjs.com', 'NS').then(console.log);

DOHClient({
  dns: 'https://1.0.0.1/dns-query',
})('cdnjs.com', 'NS').then(console.log);
DOHClient({
  dns: '1.0.0.1',
})('cdnjs.com', 'NS').then(console.log);
