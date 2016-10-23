const DNSClient = require('./lib/index');
const DNSServer = require('./lib/server');
const Request   = require('./lib/request');
const Response  = require('./lib/response');


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
exports.query = function(domain, callback){
  var client = new DNSClient();
  client.query(domain, callback);
  return client;
};