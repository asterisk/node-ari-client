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
var helpers = require('./helpers.js');

describe('events', function () {

  var url = 'http://localhost:%s';
  var user = 'user';
  var pass = 'secret';
  var ari = null;
  var server = null;
  var wsserver = null;

  before(function (done) {
    helpers.mockClient(function (err, hockServer, port) {
      server = hockServer;
      url = util.format(url, port);
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
      assert(
        _.isFunction(bridge.removeAllListeners),
        'removeAllListeners exists'
      );
      assert(_.isFunction(bridge.once), 'once exists');

      done();
    });

    it('should have scoped events', function (done) {
      var count = 0;
      var bridge1Count = 0;
      ari.removeAllListeners('BridgeDestroyed');
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
      ari.removeAllListeners('ChannelDtmfReceived');
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

    it('should allow scoped events that fire only once', function (done) {
      var count = 0;
      var channel1Count = 0;
      ari.removeAllListeners('ChannelDtmfReceived');
      ari.on('ChannelDtmfReceived', function (event, channel) {
        count += 1;

        if (count === 2 && channel1Count === 1) {
          done();
        }
      });

      var channel1 = ari.Channel();

      channel1.once('ChannelDtmfReceived', function (event, channel) {
        channel1Count += 1;
        if (channel1Count > 1) {
          throw new Error('Should not have received this event');
        }
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
          id: channel1.id
        }
      });
    });

    it('should allow removing specific scoped events', function (done) {
      var count = 0;
      var channel1Count = 0;
      ari.removeAllListeners('ChannelDtmfReceived');
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
      ari.removeAllListeners('ChannelDtmfReceived');
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

      channel1.removeAllListeners('ChannelDtmfReceived');

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

    // ensure managing instances works for channels, bridge, recordings, and
    // playbacks
    describe('managed instances', function () {

      [{
        resource: 'channel',
        standardEvent: 'ChannelDtmfReceived',
        cleanupEvent: 'StasisEnd',
        resourceCreator: function () {
          return ari.Channel();
        },
        id: 'id'
      }, {
        resource: 'bridge',
        standardEvent: 'BridgeCreated',
        cleanupEvent: 'BridgeDestroyed',
        resourceCreator: function () {
          return ari.Bridge();
        },
        id: 'id'
      }, {
        resource: 'recording',
        standardEvent: 'RecordingStarted',
        cleanupEvent: 'RecordingFinished',
        resourceCreator: function () {
          return ari.LiveRecording();
        },
        id: 'name'
      }, {
        resource: 'recording',
        standardEvent: 'RecordingStarted',
        cleanupEvent: 'RecordingFailed',
        resourceCreator: function () {
          return ari.LiveRecording();
        },
        id: 'name'
      }, {
        resource: 'playback',
        standardEvent: 'PlaybackStarted',
        cleanupEvent: 'PlaybackFinished',
        resourceCreator: function () {
          return ari.Playback();
        },
        id: 'id'
      }].forEach(function (testSetup) {

        describe(util.format('for %ss', testSetup.resource), function () {

          it('should remove listeners', function (done) {

            var count = 0;
            var testResourceCount = 0;
            var testResource;
            var isManaged;
            var instanceIds;

            ari.removeAllListeners(testSetup.standardEvent);
            ari.on(testSetup.standardEvent, function () {
              count += 1;

              if (count === 2) {
                // make sure client no longer tracks instance as managed
                instanceIds = Object.keys(ari._managedInstances);
                isManaged = !!instanceIds.find(function (candidate) {
                  return candidate === testResource[testSetup.id];
                });
                assert(!isManaged, 'Instance should no longer be managed');
                done();
              }
            });

            testResource = testSetup.resourceCreator();
            testResource.manageInstance();
            // make sure client tracks instance as managed
            instanceIds = Object.keys(ari._managedInstances);
            isManaged = !!instanceIds.find(function (candidate) {
              return candidate === testResource[testSetup.id];
            });
            assert(isManaged, 'Instance should be managed');

            testResource.on(testSetup.standardEvent, function () {
              testResourceCount += 1;

              if (testResourceCount > 1) {
                throw new Error('Should not have received this event');
              }
            });

            var standardEvent = {
              type: testSetup.standardEvent
            };
            var cleanupEvent = {
              type: testSetup.cleanupEvent
            };
            var eventResource = {};
            eventResource[testSetup.id] = testResource[testSetup.id];
            standardEvent[testSetup.resource] = eventResource;
            cleanupEvent[testSetup.resource] = eventResource;

            wsserver.send(standardEvent);
            wsserver.send(cleanupEvent);
            wsserver.send(standardEvent);
          });
        });
      });
    });

    it('should not remove listeners by default', function (done) {

      var testChannelCount = 0;

      ari.removeAllListeners('ChannelDtmfReceived');

      var testChannel = ari.Channel();

      testChannel.on('ChannelDtmfReceived', function (event, channel) {
        testChannelCount += 1;

        if (testChannelCount === 2) {
          done();
        }
      });

      wsserver.send({
        type: 'ChannelDtmfReceived',
        channel: {
          id: testChannel.id
        }
      });

      wsserver.send({
        type: 'StasisEnd',
        channel: {
          id: testChannel.id
        }
      });

      wsserver.send({
        type: 'ChannelDtmfReceived',
        channel: {
          id: testChannel.id
        }
      });
    });

    it('should track instance as managed once managed', function () {

      var testChannel = ari.Channel();
      testChannel.manageInstance();
      var testChannelCopy = ari.Channel(testChannel.id);

      assert(testChannel._isManaged, 'instance should be managed');
      assert(testChannelCopy._isManaged, 'instance copy should be managed');
    });

    // Note: this simulates a user manually removing a listener after we have
    //       already done so due to the event being a cleanup event
    it('should allow removing an already removed listener', function (done) {

      ari.removeAllListeners('ChannelDtmfReceived');

      var callback = function (event, channel) {
        done();
      };
      var testChannel = ari.Channel();

      testChannel.on('ChannelDtmfReceived', callback);
      testChannel.removeListener('ChannelDtmfReceived', callback);
      testChannel.removeListener('ChannelDtmfReceived', callback);
      testChannel.on('ChannelDtmfReceived', callback);

      wsserver.send({
        type: 'ChannelDtmfReceived',
        channel: {
          id: testChannel.id
        }
      });
    });
  });
});
