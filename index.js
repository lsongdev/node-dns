const DNSClient = require('./lib/index');
const DNSServer = require('./lib/server');
const Packet = require('./packet');

exports.Client = DNSClient;
exports.Server = DNSServer;
exports.Request  = Request;
exports.Response = Response;

/**
 * [createServer description]
 * @param  {Function} callback [description]
 * @return {[type]}            [description]
 */
exports.createServer = function(callback){
  var server = new DNSServer();
  server.on('request', callback);
  return server;
};

/**
 * [query description]
 * @param  {[type]}   domain   [description]
 * @param  {Function} callback [description]
 * @return {[type]}            [description]
 */
exports.lookup = function(domain, callback){
  var client = new DNSClient();
  client.query(domain, callback);
  return client;
};