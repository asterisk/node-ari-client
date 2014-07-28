/**
 *  Client specific unit tests.
 *
 *  @module tests-client
 *  @copyright 2014, Digium, Inc.
 *  @license Apache License, Version 2.0
 *  @author Samuel Fortier-Galarneau <sgalarneau@digium.com>
 */

'use strict';

/*global describe:false*/
/*global before:false*/
/*global after:false*/
/*global it:false*/
/*global require:false*/
/*jshint globalstrict: true*/

var client = require('../lib/client.js');
var _ = require('underscore');
var util = require('util');
var assert = require('assert');
var hock = require('hock');
var helpers = require('./helpers.js');

var operations = {
  asterisk: [
    'getInfo',
    'getGlobalVar',
    'setGlobalVar'
  ],
  applications: [
    'list',
    'get',
    'subscribe',
    'unsubscribe'
  ],
  bridges: [
    'list',
    'create',
    'create_or_update_with_id',
    'get',
    'destroy',
    'addChannel',
    'removeChannel',
    'startMoh',
    'stopMoh',
    'play',
    'record'
  ],
  channels: [
    'list',
    'originate',
    'get',
    'originateWithId',
    'hangup',
    'continueInDialplan',
    'answer',
    'ring',
    'ringStop',
    'sendDTMF',
    'mute',
    'unmute',
    'hold',
    'unhold',
    'startMoh',
    'stopMoh',
    'startSilence',
    'stopSilence',
    'play',
    'playWithId',
    'record',
    'getChannelVar',
    'setChannelVar',
    'snoopChannel',
    'snoopChannelWithId'
  ],
  deviceStates: [
    'list',
    'get',
    'update',
    'delete'
  ],
  endpoints: [
    'list',
    'listByTech',
    'get'
  ],
  mailboxes: [
    'list',
    'get',
    'update',
    'delete',
  ],
  playbacks: [
    'get',
    'stop',
    'control',
  ],
  recordings: [
    'listStored',
    'getStored',
    'deleteStored',
    'getLive',
    'cancel',
    'stop',
    'pause',
    'unpause',
    'mute',
    'unmute'
  ],
  sounds: [
    'list',
    'get'
  ]
};

describe('client', function () {

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

        done();
      }
    });
  });

  after(function (done) {
    ari.stop();
    server.close(done);
  });

  it('should load without error', function (done) {
    client.connect(url, user, pass, done);
  });

  it('should have all resources', function (done) {
    var candidates = _.keys(ari);
    var expected = [
      'asterisk',
      'applications',
      'bridges',
      'channels',
      'deviceStates',
      'endpoints',
      'events',
      'mailboxes',
      'playbacks',
      'recordings',
      'sounds'
    ];
    _.each(expected, function (resource) {
      assert(_.contains(candidates, resource));
      assert(_.isObject(ari[resource]));
    });

    done();
  });

  it('should have all instance creators', function (done) {
    var candidates = _.keys(ari);
    var expected = [
      'Bridge',
      'Channel',
      'Playback',
      'LiveRecording'
    ];
    _.each(expected, function (creator) {
      assert(_.contains(candidates, creator));
      assert(_.isFunction(ari[creator]));
    });

    done();
  });

  describe('#resources', function () {
    _.each(operations, function (value, key) {
      it(util.format('%s should have all operations', key), function (done) {
        var candidates = _.keys(ari[key]);
        var expected = value; 

        _.each(expected, function (resource) {
          assert(_.contains(candidates, resource));
          assert(_.isFunction(ari[key][resource]));
        });

        done();
      });
    });

    it('should pass resource instance when appropriate', function (done) {
      var bridge = ari.Bridge();

      server
        .post(util.format('/ari/bridges?type=holding&bridgeId=%s', bridge.id))
        .any()
        .reply(200, {'bridge_type': 'holding', id: bridge.id});

      bridge.create({type: 'holding'}, function (err, instance) {
        assert(_.isObject(instance));
        assert.equal(instance.id, bridge.id);

        _.each(operations.bridges, function (operation) {
          assert(_.contains(_.keys(bridge), operation));
        });

        done();
      });
    });

    it('should not find resources that do not exist', function (done) {

      server
        .get('/ari/bridges/1')
        .any()
        .reply(404, {'message': 'Bridge not found'});

      ari.bridges.get({bridgeId: '1'}, function (err, bridge) {
        assert(bridge === undefined);
        assert(err.message.match('Bridge not found'));
        
        done();
      });
    });

    it('should deal with a bad parameter', function (done) {

      server
        .post('/ari/bridges?type=holding')
        .any()
        .reply(200, {'bridge_type': 'holding', id: '123443555.1'})
        .get('/ari/bridges')
        .any()
        .reply(200, [{'bridge_type': 'holding', id: '123443555.1'}])
        .get('/ari/bridges/123443555.1')
        .any()
        .reply(200, {'bridge_type': 'holding', id: '123443555.1'});

      ari.bridges.create({type: 'holding'}, function (err, instance) {
        ari.bridges.list(function (err, bridges) {
          ari.bridges.get(
              {bogus: '', bridgeId: bridges[0].id},
              function (err, bridge) {

            assert.equal(bridges[0].id, bridge.id);

            done();
          });
        });
      });
    });

    it('should pass ids to operations when appropriate', function (done) {

      var bridge = ari.Bridge();
      server
        .post(util.format('/ari/bridges?type=holding&bridgeId=%s', bridge.id))
        .any()
        .reply(200, {'bridge_type': 'holding', id: bridge.id})
        .get(util.format('/ari/bridges/%s', bridge.id))
        .any()
        .reply(200, {'bridge_type': 'holding', id: bridge.id});

      ari.bridges.create({type: 'holding'}, function (err, bridge) {
        bridge.get(function (err, instance) {
          assert.equal(instance.id, bridge.id);

          done();
        });
      });
    });
  });

  describe('#creators', function () {
    it('should generate unique ids', function (done) {
      var bridge = ari.Bridge();
      var bridge2 = ari.Bridge();
      var regex = /[a-z0-9]{8}(-[a-z0-9]{4}){3}-[a-z0-9]{12}/;

      assert.notEqual(bridge.id, bridge2);
      assert(bridge.id);
      assert(bridge2.id);
      assert(regex.exec(bridge.id));
      assert(regex.exec(bridge2.id));

      done();
    });

    it('should have all operations', function (done) {
      var bridge = ari.Bridge();

      _.each(operations.bridges, function (operation) {
        _.contains(_.keys(bridge), operation);
      });

      done();
    });

    it('should pass unique id when calling a create method', function (done) {
      var bridge = ari.Bridge();

      server
        .post(util.format('/ari/bridges?type=holding&bridgeId=%s', bridge.id))
        .any()
        .reply(200, {'bridge_type': 'holding', id: bridge.id});

      bridge.create({type: 'holding'}, function (err, instance) {
        assert.equal(instance.id, bridge.id);

        done();
      });
    });

    it('should pass instance id when calling a create method', function (done) {
      var bridge = ari.Bridge();
      var recording = ari.LiveRecording();

      server
        .post(util.format('/ari/bridges?type=holding&bridgeId=%s', bridge.id))
        .any()
        .reply(200, {'bridge_type': 'holding', id: bridge.id})
        .post(
          util.format(
            '/ari/bridges/%s/record?name=%s&format=wav&maxDurationSeconds=1',
            bridge.id,
            recording.name
          )
        )
        .any()
        .reply(200, {format: 'wav', name: recording.name});

      bridge.create({type: 'holding'}, function (err, bridgeInstance) {
        var opts = {format: 'wav', maxDurationSeconds: '1'};
        bridge.record(opts, recording, function (err, instance) {
          assert(instance.name);
          assert.equal(instance.name, recording.name);

          done();
        });
      });
    });

    it('should not modify options passed in to operations', function (done) {
      var bridge = ari.Bridge();

      server
        .post(util.format('/ari/bridges?type=mixing&bridgeId=%s', bridge.id))
        .any()
        .reply(200, {'bridge_type': 'mixing', id: bridge.id})
        .post(
          util.format(
            '/ari/applications/unittests/subscription?eventSource=bridge%3A%s',
            bridge.id
          )
        )
        .any()
        .reply(200, {name: 'unittests', 'bridge_ids': [bridge.id]});

      bridge.create({type: 'mixing'}, function (err, newBridge) {
        var opts = {
          applicationName: 'unittests',
          eventSource: util.format('bridge:%s', bridge.id)
        };

        ari.applications.subscribe(opts, function (err, application) {
          assert(application);
          assert.equal(application['bridge_ids'][0], bridge.id);
          assert.equal(opts.applicationName, 'unittests');
          assert.equal(opts.eventSource, util.format('bridge:%s', bridge.id));

          done();
        });
      });
    });

    it('should allow passing in id on creation', function (done) {
      var recording = ari.LiveRecording('mine');
      var channel = ari.Channel('1234');

      assert.equal(recording.name, 'mine');
      assert.equal(channel.id, '1234');

      done();
    });

    it('should allow passing in values on creation', function (done) {
      var mailbox = ari.Mailbox({name: '1234', oldMessages: 0});

      assert.equal(mailbox.name, '1234');
      assert.equal(mailbox.oldMessages, 0);

      done();
    });

    it('should allow passing in id and values on creation', function (done) {
      var mailbox = ari.Mailbox('1234', {oldMessages: 0});

      assert.equal(mailbox.name, '1234');
      assert.equal(mailbox.oldMessages, 0);

      done();
    });

    it('should allow passing function variables to client or resource',
        function(done) {

      var channel = ari.Channel();
      var body = '{"variables":{"CALLERID(name)":"Alice"}}';

      server
        .post(
          '/ari/channels?endpoint=SIP%2Fsoftphone&app=unittests',
          body
        )
        .any()
        .reply(200, {id: '1'})
        .post(
          util.format(
            '/ari/channels?endpoint=SIP%2Fsoftphone&app=unittests&channelId=%s',
            channel.id
          ),
          body
        )
        .any()
        .reply(200, {id: '1'});

      var options = {
        endpoint: 'SIP/softphone',
        app: 'unittests',
        variables: {'CALLERID(name)': 'Alice'}
      };
      ari.channels.originate(options, function(err, channel) {
        if (!err) {
          channel.originate(options, function(err, channel) {
            if (!err) {
              done();
            }
          });
        }
      });
    });

    it('should allow passing standard variables to client or resource',
        function(done) {

      var channel = ari.Channel();
      var body = '{"variables":{"CUSTOM":"myvar"}}';

      server
        .post(
          '/ari/channels?endpoint=SIP%2Fsoftphone&app=unittests',
          body
        )
        .any()
        .reply(200, {id: '1'})
        .post(
          util.format(
            '/ari/channels?endpoint=SIP%2Fsoftphone&app=unittests&channelId=%s',
            channel.id
          ),
          body
        )
        .any()
        .reply(200, {id: '1'});

      var options = {
        endpoint: 'SIP/softphone',
        app: 'unittests',
        variables: {'CUSTOM': 'myvar'}
      };
      ari.channels.originate(options, function(err, channel) {
        if (!err) {
          channel.originate(options, function(err, channel) {
            if (!err) {
              done();
            }
          });
        }
      });
    });

  });
});

