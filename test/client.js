/**
 *  Client specific unit tests.
 *
 *  @module tests-client
 *  @copyright 2014, Digium, Inc.
 *  @license Apache License, Version 2.0
 *  @author Samuel Fortier-Galarneau <sgalarneau@digium.com>
 */

'use strict';

var util = require('util');
var assert = require('assert');
var _ = require('lodash');
var Promise = require('bluebird');
var http = require('http');
var portfinder = require('portfinder');
var client = require('../lib/client.js');
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
    'clearVideoSource',
    'create',
    'createWithId',
    'get',
    'destroy',
    'addChannel',
    'removeChannel',
    'setVideoSource',
    'startMoh',
    'stopMoh',
    'play',
    'playWithId',
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
    'getStoredFile',
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

  var url = 'http://localhost:%s';
  var hostIsNotReachableUrls =
      {
        ENOTFOUND: 'http://notthere:8088',
        ECONNREFUSED: 'http://localhost:65535'
      };
  var user = 'user';
  var pass = 'secret';
  var ari = null;
  var server = null;
  var wsserver = null;

  before(function (done) {
    portfinder.getPort(function (err, port) {
      assert.ifError(err);

      server = helpers.buildMockServer(port);
      server.realServer = http.createServer(server.handler);
      server.realServer.listen(port, function () {
        url = util.format(url, port);
        client.connect(url, user, pass, function (err, connectedClient) {
          ari = connectedClient;
          wsserver = helpers.createWebSocketServer(server.realServer);
          ari.start('unittests');
          done();
        });
      });
    });
  });

  after(function (done) {
    ari.stop();
    server.realServer.close(done);
  });

  it('should connect', function (done) {
    client.connect(url, user, pass, done);
  });

  it('should send an error on ENOTFOUND', function (done) {
    client.connect(
      hostIsNotReachableUrls.ENOTFOUND, user, pass, function (err) {
      if (err && err.name === 'HostIsNotReachable') {
        done();
      } else {
        assert.fail('Should not be able to connect to ' +
          hostIsNotReachableUrls.ENOTFOUND);
      }
    });
  });

  it('should send an error on ECONNREFUSED', function (done) {
    client.connect(
      hostIsNotReachableUrls.ECONNREFUSED, user, pass, function (err) {
      if (err && err.name === 'HostIsNotReachable') {
        done();
      } else {
        assert.fail('Should not be able to connect to ' +
          hostIsNotReachableUrls.ECONNREFUSED);
      }
    });
  });

  it('should auto-reconnect websocket', function (done) {
    wsserver.reconnect();

    setTimeout(function() {
      ari.on('PlaybackFinished', function(event, playback) {
        assert(playback.id === 1);

        done();
      });

      wsserver.send({
        type: 'PlaybackFinished',
        playback: {
          id: 1
        }
      });
    }, 1000);
  });

  it('should not auto-reconnect websocket after calling stop', function (done) {
    ari.stop();

    setTimeout(function() {
      try {
        wsserver.send({
          type: 'PlaybackFinished'
        });
      } catch (err) {
        ari.start('unittests');

        done();
      }
    }, 1000);
  });

  it('send reconnect lifecycle events', function (done) {
    client.connect(url, user, pass, function (err) {
      if (err) { return done(err); }
      wsserver.reconnect();
      ari.once('WebSocketReconnecting', function () {
        ari.once('WebSocketConnected', function () {
          done();
        });
      });
    });
  });

  it('can reconnect a lot if it can successfully connect', function (done) {
    var reconnectCount = 20;

    // this test might be a bit slow
    this.timeout(60000);

    client.connect(url, user, pass, function (err) {
      if (err) { return done(err); }

      function doItAgain() {
        if (reconnectCount-- === 0) {
          done();
          return;
        }

        wsserver.reconnect();
        ari.once('WebSocketConnected', function () {
          doItAgain();
        });

        ari.once('WebSocketMaxRetries', function () {
          assert.fail('Should not have given up reconnecting');
        });
      }

      doItAgain();
    });
  });

  it('should connect using promises', function (done) {
    client.connect(url, user, pass).then(function (client) {
      if (client) {
        done();
      }
    }).done();
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
      assert(_.includes(candidates, resource));
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
      assert(_.includes(candidates, creator));
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
          assert(_.includes(candidates, resource));
          assert(_.isFunction(ari[key][resource]));
        });

        done();
      });
    });

    it('should support promises', function (done) {
      var bridge = ari.Bridge('promises');

      server
        .post(util.format('/ari/bridges?type=holding&bridgeId=%s', bridge.id))
        .any()
        .reply(200, {'bridge_type': 'holding', id: bridge.id});

      ari.bridges.create({
        bridgeId: bridge.id,
        type: 'holding'
      }).then(function (instance) {
        validate(instance);

        return instance.create({
          bridgeId: instance.id,
          type: 'holding'
        });
      }).then(function (instance) {
        validate(instance);

        done();
      })
      .done();

      function validate(instance) {
        assert(_.isObject(instance));
        assert.equal(instance.id, bridge.id);

        _.each(operations.bridges, function (operation) {
          assert(_.includes(_.keys(bridge), operation));
        });
      }
    });

    it('should work with promisify', function (done) {
      var bridge = ari.Bridge('denodeify');

      server
        .post(util.format('/ari/bridges?type=holding&bridgeId=%s', bridge.id))
        .any()
        .reply(200, {'bridge_type': 'holding', id: bridge.id});

      var create = Promise.promisify(ari.bridges.create, ari);

      create({
        bridgeId: bridge.id,
        type: 'holding'
      }).then(function (instance) {
        validate(instance);

        create = Promise.promisify(instance.create, instance);

        return create({
          bridgeId: instance.id,
          type: 'holding'
        });
      }).then(function (instance) {
        validate(instance);

        done();
      })
      .done();

      function validate(instance) {
        assert(_.isObject(instance));
        assert.equal(instance.id, bridge.id);

        _.each(operations.bridges, function (operation) {
          assert(_.includes(_.keys(bridge), operation));
        });
      }
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

    it('should not find resources that do not exist using promises',
       function (done) {

      server
        .get('/ari/bridges/1')
        .any()
        .reply(404, {'message': 'Bridge not found'});

      ari.bridges.get({bridgeId: '1'}).catch(function (err) {
        assert(err.message.match('Bridge not found'));

        done();
      })
      .done();
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

    it('should deal with a bad parameter using promises', function (done) {

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

      ari.bridges.create({type: 'holding'}).then(function (instance) {
        return ari.bridges.list();
      })
      .then(function (bridges) {
        return ari.bridges.get({
          bogus: '',
          bridgeId: bridges[0].id
        }).then(function (bridge) {
          assert.equal(bridges[0].id, bridge.id);

          done();
        });
      })
      .done();
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

      ari.bridges.create({
        bridgeId: bridge.id,
        type: 'holding'
      }, function (err, bridge) {
        bridge.get(function (err, instance) {
          assert.equal(instance.id, bridge.id);

          done();
        });
      });
    });

    it('should pass ids to operations when appropriate using promises',
     function (done) {

      var bridge = ari.Bridge();
      server
        .post(util.format('/ari/bridges?type=holding&bridgeId=%s', bridge.id))
        .any()
        .reply(200, {'bridge_type': 'holding', id: bridge.id})
        .get(util.format('/ari/bridges/%s', bridge.id))
        .any()
        .reply(200, {'bridge_type': 'holding', id: bridge.id});

      ari.bridges.create({
        bridgeId: bridge.id,
        type: 'holding'
      }).then(function (bridge) {
        return bridge.get();
      })
      .then(function (instance) {
        assert.equal(instance.id, bridge.id);

        done();
      })
      .done();
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
        _.includes(_.keys(bridge), operation);
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

    it('should pass unique id when calling a create method using promises',
       function (done) {

      var bridge = ari.Bridge();

      server
        .post(util.format('/ari/bridges?type=holding&bridgeId=%s', bridge.id))
        .any()
        .reply(200, {'bridge_type': 'holding', id: bridge.id});

      bridge.create({type: 'holding'}).then(function (instance) {
        assert.equal(instance.id, bridge.id);

        done();
      })
      .done();
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

    it('should pass instance id when calling a create method using promises',
       function (done) {

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

      bridge.create({type: 'holding'}).then(function (bridgeInstance) {
        var opts = {format: 'wav', maxDurationSeconds: '1'};

        return bridge.record(opts, recording);
      }).then(function (instance) {
        assert(instance.name);
        assert.equal(instance.name, recording.name);

        done();
      })
      .done();
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

    it('should not modify options passed in to operations using promises',
       function (done) {

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

      var opts = {
        applicationName: 'unittests',
        eventSource: util.format('bridge:%s', bridge.id)
      };

      bridge.create({type: 'mixing'}).then(function (newBridge) {
        return ari.applications.subscribe(opts);
      }).then(function (application) {
        assert(application);
        assert.equal(application['bridge_ids'][0], bridge.id);
        assert.equal(opts.applicationName, 'unittests');
        assert.equal(opts.eventSource, util.format('bridge:%s', bridge.id));

        done();
      })
      .done();
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
        function (done) {

      var channel = ari.Channel();
      var body = '{"variables":{"CALLERID(name)":"Alice"}}';

      server
        .post(
          '/ari/channels?endpoint=PJSIP%2Fsoftphone&app=unittests',
          body
        )
        .any()
        .reply(200, {id: '1'})
        .post(
          util.format(
            '/ari/channels?endpoint=PJSIP%2Fsoftphone&app=unittests&channelId=%s',
            channel.id
          ),
          body
        )
        .any()
        .reply(200, {id: '1'});

      var options = {
        endpoint: 'PJSIP/softphone',
        app: 'unittests',
        variables: {'CALLERID(name)': 'Alice'}
      };
      ari.channels.originate(options, function (err, channel) {
        if (!err) {
          channel.originate(options, function (err, channel) {
            if (!err) {
              done();
            }
          });
        }
      });
    });

    it('should allow passing function variables ' +
       'to client or resource using promises', function (done) {

      var channel = ari.Channel();
      var body = '{"variables":{"CALLERID(name)":"Bob"}}';

      server
        .post(
          '/ari/channels?endpoint=PJSIP%2Fsoftphone&app=unittests',
          body
        )
        .any()
        .reply(200, {id: '1'})
        .post(
          util.format(
            '/ari/channels?endpoint=PJSIP%2Fsoftphone&app=unittests&channelId=%s',
            channel.id
          ),
          body
        )
        .any()
        .reply(200, {id: '1'});

      var options = {
        endpoint: 'PJSIP/softphone',
        app: 'unittests',
        variables: {'CALLERID(name)': 'Bob'}
      };

      ari.channels.originate(options).then(function (channel) {
        return channel.originate(options);
      })
      .then(function (channel) {
        done();
      })
      .done();
    });

    it('should allow passing standard variables to client or resource',
        function (done) {

      var channel = ari.Channel();
      var body = '{"variables":{"CUSTOM":"myvar"}}';

      server
        .post(
          '/ari/channels?endpoint=PJSIP%2Fsoftphone&app=unittests',
          body
        )
        .any()
        .reply(200, {id: '1'})
        .post(
          util.format(
            '/ari/channels?endpoint=PJSIP%2Fsoftphone&app=unittests&channelId=%s',
            channel.id
          ),
          body
        )
        .any()
        .reply(200, {id: '1'});

      var options = {
        endpoint: 'PJSIP/softphone',
        app: 'unittests',
        variables: {'CUSTOM': 'myvar'}
      };
      ari.channels.originate(options, function (err, channel) {
        if (!err) {
          channel.originate(options, function (err, channel) {
            if (!err) {
              done();
            }
          });
        }
      });
    });

    it('should allow passing standard variables ' +
       'to client or resource using promises', function (done) {

      var channel = ari.Channel();
      var body = '{"variables":{"CUSTOM":"myothervar"}}';

      server
        .post(
          '/ari/channels?endpoint=PJSIP%2Fsoftphone&app=unittests',
          body
        )
        .any()
        .reply(200, {id: '1'})
        .post(
          util.format(
            '/ari/channels?endpoint=PJSIP%2Fsoftphone&app=unittests&channelId=%s',
            channel.id
          ),
          body
        )
        .any()
        .reply(200, {id: '1'});

      var options = {
        endpoint: 'PJSIP/softphone',
        app: 'unittests',
        variables: {'CUSTOM': 'myothervar'}
      };

      ari.channels.originate(options).then(function (channel) {
        return channel.originate(options);
      })
      .then(function (channel) {
        done();
      })
      .done();
    });

  });
});
