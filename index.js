const DNSClient = require('./lib/index');
const DNSServer = require('./lib/server');

/**
 * [createServer description]
 * @param  {Function} callback [description]
 * @return {[type]}            [description]
 */
exports.createServer = function(callback){
  var server = new DNSServer();
  server.on('query', callback);
  return server;
};

/**
 * [query description]
 * @param  {[type]}   domain   [description]
 * @param  {Function} callback [description]
 * @return {[type]}            [description]
 */
exports.query = function(domain, callback){
  var client = new DNSClient();
  client.query(domain, callback);
  return client;
};