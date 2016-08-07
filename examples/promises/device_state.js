/**
 *  This example shows how a custom device state can be updated based on whether
 *  or not a bridge is busy (at least 1 channel exists in the bridge).
 *
 *  @namespace device-state-example
 *
 *  @copyright 2014, Digium, Inc.
 *  @license Apache License, Version 2.0
 *  @author Samuel Fortier-Galarneau <sgalarneau@digium.com>
 *  @example <caption>Dialplan</caption>
 *  exten => 7000,hint,Stasis:device-state-example
 *  exten => 7000,1,NoOp()
 *      same => n,Stasis(device-state-example)
 *      same => n,Hangup()
 */

'use strict';

var client = require('ari-client');
var util = require('util');

var BRIDGE_STATE = 'device-state-example';

// replace ari.js with your Asterisk instance
client.connect('http://ari.js:8088', 'user', 'secret',
    /**
     *  Setup event listeners and start application.
     *
     *  @callback connectCallback
     *  @memberof device-state-example
     *  @param {Error} err - error object if any, null otherwise
     *  @param {module:ari-client~Client} ari - ARI client
     */
    function (err, ari) {

  var bridge = ari.Bridge();
  // Keep track of bridge state at the application level so we don't have to
  // make extra calls to ARI
  var currentBridgeState = 'NOT_INUSE';

  bridge.create({type: 'mixing'})
    .then(function (instance) {

      // Mark this bridge as available
      var opts = {
        deviceName: util.format('Stasis:%s', BRIDGE_STATE),
        deviceState: 'NOT_INUSE'
      };

      return ari.deviceStates.update(opts);
    })
    .catch(function (err) {});

  ari.on('ChannelEnteredBridge',
      /**
       *  If at least 1 channel exists in bridge and current device state not
       *  set to BUSY, set the device state to BUSY.
       *
       *  @callback channelEnteredBridgeCallback
       *  @memberof device-state-example
       *  @param {Error} err - error object if any, null otherwise
       *  @param {Object} objects - object of resources (bridge and channel)
       */
      function (event, objects) {

    if (objects.bridge.channels.length > 0 && currentBridgeState !== 'BUSY') {
      // Mark this bridge as busy
      var opts = {
        deviceName: util.format('Stasis:%s', BRIDGE_STATE),
        deviceState: 'BUSY'
      };

      ari.deviceStates.update(opts)
        .catch(function (err) {});
      currentBridgeState = 'BUSY';
    }
  });

  ari.on('ChannelLeftBridge',
      /**
       *  If no channels remain in the bridge, set device state to not in use.
       *
       *  @callback channelLeftBridgeCallback
       *  @memberof device-state-example
       *  @param {Error} err - error object if any, null otherwise
       *  @param {Object} objects - object of resources (bridge and channel)
       */
      function (event, objects) {

    if (objects.bridge.channels.length === 0 &&
        currentBridgeState !== 'NOT_INUSE') {

      // Mark this bridge as available
      var opts = {
        deviceName: util.format('Stasis:%s', BRIDGE_STATE),
        deviceState: 'NOT_INUSE'
      };

      ari.deviceStates.update(opts)
        .catch(function (err) {});
      currentBridgeState = 'NOT_INUSE';
    }
  });

  ari.on('StasisStart',
      /**
       *  Answer incoming channel and add it to the bridge.
       *
       *  @callback stasisStartCallback
       *  @memberof device-state-example
       *  @param {Error} err - error object if any, null otherwise
       *  @param {module:resources~Channel} incoming -
       *    channel that has entered Stasis
       */
      function (event, incoming) {

    incoming.answer()
      .then(function (channel) {
        return bridge.addChannel({channel: incoming.id});
      })
      .catch(function (err) {});
  });

  // can also use ari.start(['app-name'...]) to start multiple applications
  ari.start('device-state-example');
});
