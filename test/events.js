/**
 *  Events specific unit tests testing the Client EventEmitter and instance
 *  scoped events on resources.
 *
 *  @module tests-event
 *  @copyright 2014, Digium, Inc.
 *  @license Apache License, Version 2.0
 *  @author Samuel Fortier-Galarneau <sgalarneau@digium.com>
 */

'use strict';

/*global describe:false*/
/*global before:false*/
/*global after:false*/
/*global it:false*/
/*global setTimeout:false*/
/*global require:false*/
/*jshint globalstrict: true*/

var client = require('../lib/client.js');
var _ = require('underscore');
var util = require('util');
var assert = require('assert');
var hock = require('hock');
var helpers = require('./helpers.js');

describe('events', function () {

  var url = 'http://localhost:8088';
  var user = 'user';
  var pass = 'secret';
  var ari = null;
  var server = null;
  var wsserver = null;

  before(function (done) {
    helpers.mockClient(function (err, hockServer) {
      server = hockServer;
      client.connect(url, user, pass, clientLoaded);

      function clientLoaded (err, newClient) {
        ari = newClient;
        wsserver = helpers.createWebSocketServer(server._server);
        ari.start('unittests');

        // ensure socket is connected before tests start
        setTimeout(function () {
          done();
        }, 1000);
      }
    });
  });

  after(function (done) {
    ari.stop();
    server.close(done);
  });

  describe('#client', function () {
    it('should have event functions', function (done) {
      assert(_.isFunction(ari.on), 'on exists');
      assert(_.isFunction(ari.once), 'once exists');
      assert(_.isFunction(ari.addListener), 'addListener exists');
      assert(_.isFunction(ari.removeListener), 'removeListener exists');

      done();
    });

    it('should receive all events', function (done) {
      var count = 0;
      ari.on('PlaybackFinished', function (event, playback) {
        count += 1;

        if (count === 2) {
          done();
        }
      });

      for (var i = 0; i < 2; i++) {
        var id = i.toString();
        wsserver.send({
          type: 'PlaybackFinished',
          playback: {
            id: id,
            state: 'complete',
            'media_uri': 'sound:hello-world'
          }
        });
      }
    });
  });

  describe('#resources', function () {
    it('should have event functions', function (done) {
      var bridge = ari.Bridge();
      assert(_.isFunction(bridge.on), 'on exists');
      assert(_.isFunction(bridge.addListener), 'addListener exists');
      assert(_.isFunction(bridge.removeListener), 'removeListener exists');
      // not yet implemented
      // assert(_.isFunction(bridge.once), 'once exists');

      done();
    });

    it('should have scoped events', function (done) {
      var count = 0;
      var bridge1Count = 0;
      ari.on('BridgeDestroyed', function (event, bridge) {
        count += 1;

        if (count === 2 && bridge1Count === 1) {
          done();
        }
      });

      var bridge1 = ari.Bridge();
      var bridge2 = ari.Bridge();

      bridge1.on('BridgeDestroyed', function (event, bridge) {
        bridge1Count += 1;
      });

      wsserver.send({
        type: 'BridgeDestroyed',
        bridge: {
          id: bridge1.id
        }
      });

      wsserver.send({
        type: 'BridgeDestroyed',
        bridge: {
          id: bridge2.id
        }
      });
    });

    it('should allow multiple scoped events', function (done) {
      var count = 0;
      var channel1Count = 0;
      ari.on('ChannelDtmfReceived', function (event, channel) {
        count += 1;

        if (count === 2 && channel1Count === 2) {
          done();
        }
      });

      var channel1 = ari.Channel();
      var channel2 = ari.Channel();

      channel1.on('ChannelDtmfReceived', function (event, channel) {
        channel1Count += 1;
      });

      channel1.on('ChannelDtmfReceived', function (event, channel) {
        channel1Count += 1;
      });

      wsserver.send({
        type: 'ChannelDtmfReceived',
        digit: '1',
        channel: {
          id: channel1.id
        }
      });

      wsserver.send({
        type: 'ChannelDtmfReceived',
        digit: '2',
        channel: {
          id: channel2.id
        }
      });
    });

    it('should allow removing specific scoped events', function (done) {
      var count = 0;
      var channel1Count = 0;
      ari.on('ChannelDtmfReceived', function (event, channel) {
        count += 1;

        if (count === 2 && channel1Count === 1) {
          done();
        }
      });

      var channel1 = ari.Channel();
      var channel2 = ari.Channel();

      channel1.on('ChannelDtmfReceived', function (event, channel) {
        channel1Count += 1;
      });

      var callback = function (event, channel) {
        throw new Error('Should not have received this event');
      };

      channel2.on('ChannelDtmfReceived', callback);
      channel2.removeListener('ChannelDtmfReceived', callback);

      wsserver.send({
        type: 'ChannelDtmfReceived',
        digit: '1',
        channel: {
          id: channel1.id
        }
      });

      wsserver.send({
        type: 'ChannelDtmfReceived',
        digit: '2',
        channel: {
          id: channel2.id
        }
      });
    });

    it('should allow removing all scoped events', function (done) {
      var count = 0;
      ari.on('ChannelDtmfReceived', function (event, channel) {
        count += 1;

        if (count === 2) {
          done();
        }
      });

      var channel1 = ari.Channel();

      channel1.on('ChannelDtmfReceived', function (event, channel) {
        throw new Error('Should not have received this event');
      });

      channel1.on('ChannelDtmfReceived', function (event, channel) {
        throw new Error('Should not have received this event');
      });

      channel1.removeAllListener('ChannelDtmfReceived');

      wsserver.send({
        type: 'ChannelDtmfReceived',
        digit: '1',
        channel: {
          id: channel1.id
        }
      });

      wsserver.send({
        type: 'ChannelDtmfReceived',
        digit: '2',
        channel: {
          id: channel1.id
        }
      });
    });

  });
});

