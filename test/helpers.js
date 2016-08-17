/**
 *  Unit test helpers.
 *
 *  @module tests-helpers
 *  @copyright 2014, Digium, Inc.
 *  @license Apache License, Version 2.0
 *  @author Samuel Fortier-Galarneau <sgalarneau@digium.com>
 */

'use strict';

var hock = require('hock');
var fs = require('fs');
var util = require('util');
var moment = require('moment');
var ws = require('ws');
var portfinder = require('portfinder');

/**
 *  Creates a web socket server that can be used to send messages to a unit test
 *  ARI client for the purposes of mocking events.
 *
 *  @function createWebSocketServer
 *  @memberof module:tests-helpers
 *  @param {Object} httpserver - http server to attach web socket server to
 *  @returns {module:tests-helpers.WebSocketServer} web socket server
 */
function createWebSocketServer (httpserver) {
  var server = new ws.Server({server: httpserver});
  var socket = null;

  server.on('connection', processConnection);

  /**
   *  Web socket server with a send method that will send a message to a
   *  listening web socket.
   *
   *  @class WebSocketServer
   *  @memberof module:tests-helpers
   *  @property {Function} send - send a message to the listening socket
   */
  return {
    /**
     *  Sends the json message to the currently connected socket.
     *
     *  @param {Object} msg - the json message to send
     */
    send: function (msg) {
      if (socket) {
        socket.send(JSON.stringify(msg));
      }
    },

    /**
     *  Disconnects the server and reconnects.
     *
     *  This is intended to test client auto-reconnect.
     */
    reconnect: function() {
      server.close(function() {
        server = new ws.Server({server: httpserver});
        server.on('connection', processConnection);
      });
    }
  };

  /**
   *  Store the incoming websocket for future use.
   *
   *  @param {WebSocket} socket - socket for the last connection
   */
  function processConnection(websocket) {
    socket = websocket;
  }

}

/**
 *  Sets up a hock API mock to support running ari-hockServer.connect.
 *
 *  @function mockClient
 *  @memberof module:tests-helpers
 *  @param {number} port the port to run the server on
 *  @returns The hock mock server
 */
function buildMockServer(port) {
  var hockServer = hock.createHock();

  var body = readJsonFixture('resources', port);
  var headers = getJsonHeaders(body);
  hockServer
      .get('/ari/api-docs/resources.json')
      .any()
      .reply(200, body, headers);

  // setup recordings URI
  body = readJsonFixture('recordings', port);
  headers = getJsonHeaders(body);
  hockServer
      .get('/ari/api-docs/recordings.json')
      .any()
      .reply(200, body, headers);

  // setup bridges URI
  body = readJsonFixture('bridges', port);
  headers = getJsonHeaders(body);
  hockServer
      .get('/ari/api-docs/bridges.json')
      .any()
      .reply(200, body, headers);

  // setup endpoints URI
  body = readJsonFixture('endpoints', port);
  headers = getJsonHeaders(body);
  hockServer
      .get('/ari/api-docs/endpoints.json')
      .any()
      .reply(200, body, headers);

  // setup asterisk URI
  body = readJsonFixture('asterisk', port);
  headers = getJsonHeaders(body);
  hockServer
      .get('/ari/api-docs/asterisk.json')
      .any()
      .reply(200, body, headers);

  // setup sounds URI
  body = readJsonFixture('sounds', port);
  headers = getJsonHeaders(body);
  hockServer
      .get('/ari/api-docs/sounds.json')
      .any()
      .reply(200, body, headers);

  // setup channels URI
  body = readJsonFixture('channels', port);
  headers = getJsonHeaders(body);
  hockServer
      .get('/ari/api-docs/channels.json')
      .any()
      .reply(200, body, headers);

  // setup playbacks URI
  body = readJsonFixture('playbacks', port);
  headers = getJsonHeaders(body);
  hockServer
      .get('/ari/api-docs/playbacks.json')
      .any()
      .reply(200, body, headers);

  // setup deviceStates URI
  body = readJsonFixture('deviceStates', port);
  headers = getJsonHeaders(body);
  hockServer
      .get('/ari/api-docs/deviceStates.json')
      .any()
      .reply(200, body, headers);

  // setup mailboxes URI
  body = readJsonFixture('mailboxes', port);
  headers = getJsonHeaders(body);
  hockServer
      .get('/ari/api-docs/mailboxes.json')
      .any()
      .reply(200, body, headers);

  // setup applications URI
  body = readJsonFixture('asterisk');
  headers = getJsonHeaders(body);
  hockServer
      .get('/ari/api-docs/asterisk.json')
      .any()
      .reply(200, body, headers);

  // setup applications URI
  body = readJsonFixture('applications', port);
  headers = getJsonHeaders(body);
  hockServer
      .get('/ari/api-docs/applications.json')
      .any()
      .reply(200, body, headers);

  // setup events URI
  body = readJsonFixture('events', port);
  headers = getJsonHeaders(body);
  hockServer
      .get('/ari/api-docs/events.json')
      .any()
      .reply(200, body, headers);

  return hockServer;
}

/**
 *  Returns a json fixture representing an ARI response body.
 *
 *  @function readJsonFixture
 *  @memberof module:tests-helpers
 *  @private
 *  @param {string} filename - the name of the fixture
 *  @param {integer} port - the port the server is running on
 *  @returns {string} the string representation of the json fixture 
 */
function readJsonFixture (filename, port) {
  // remove the last newline if it exists
  var json = fs.readFileSync(
    util.format('%s/fixtures/%s.json', __dirname, filename),
    'utf8'
  )
  .replace(/\n$/, '')
  .replace(/8088/g, port);
  return json;
}

/**
 *  Returns the headers found in an ARI response.
 *
 *  @function getJsonHeaders
 *  @memberof module:tests-helpers
 *  @param {string} json - json body of the response
 *  @returns {Object} header object to be used in mocking json responses
 */
function getJsonHeaders (json) {
  return {
    'server': 'Asterisk/SVN-branch-12-r410918M',
    'date': moment().utc().format('ddd, DD MMM YYYY HH:mm:ss [GMT]'),
    'connection': 'close',
    'cache-control': 'no-cache, no-store',
    'content-length': util.format('%s', json.length),
    'content-type': 'application/json'
  };
}

module.exports.buildMockServer = buildMockServer;
module.exports.getJsonHeaders = getJsonHeaders;
module.exports.createWebSocketServer = createWebSocketServer;

