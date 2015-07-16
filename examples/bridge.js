/**
 *  This example shows how a channel entering a Stasis application can be added
 *  to a holding bridge and music on hold played on that channel.
 *
 *  @namespace bridge-example
 *
 *  @copyright 2014, Digium, Inc.
 *  @license Apache License, Version 2.0
 *  @author Samuel Fortier-Galarneau <sgalarneau@digium.com>
 *  @example <caption>Dialplan</caption>
 *  exten => 7000,1,NoOp()
 *      same => n,Stasis(bridge-example)
 *      same => n,Hangup()
 */

'use strict';

/*global require:false*/
/*jshint globalstrict: true*/

var client = require('ari-client');

client.connect('http://ari.js:8088', 'user', 'secret',
    /**
     *  Setup event listeners and start application.
     *
     *  @callback connectCallback
     *  @memberof bridge-example
     *  @param {Error} err - error object if any, null otherwise
     *  @param {module:ari-client~Client} ari - ARI client
     */
    function (err, ari) {

  // use once to start the application
  ari.on('StasisStart',
      /**
       *  Answer incoming channel, join holding bridge, then play music on hold.
       *
       *  @callback stasisStartCallback
       *  @memberof bridge-example
       *  @param {Event} event - full event object
       *  @param {module:resources~Channel} channel -
       *    the channel that entered Stasis
       */
      function (event, incoming) {

    incoming.answer(function (err) {
      getOrCreateBridge(incoming);
    });
  });

  /**
   *  Join holding bridge and play music on hold. If a holding bridge already
   *  exists, that bridge is used, otherwise a holding bridge is created.
   *
   *  @function getOrCreateBridge
   *  @memberof bridge-example
   *  @param {module:resources~Channel} channel -
   *    the channel that entered Stasis
   */
  function getOrCreateBridge (channel) {
    ari.bridges.list(
        /**
         *  Attempt to find existing holding bridge. If none is found, create
         *  one.
         *
         *  @callback bridgeListCallback
         *  @memberof bridge-example
         *  @param {Error} err - error object if any, null otherwise
         *  @param {module:resources~Bridge[]} bridges - an array of bridges
         *    representing the currently existing bridges
         */
        function (err, bridges) {

      var bridge = bridges.filter(function (candidate) {
        return candidate['bridge_type'] === 'holding';
      })[0];

      if (!bridge) {
        bridge = ari.Bridge();
        bridge.create({type: 'holding'},
            /**
             *  Add incoming channel to newly created holding bridge and play
             *  music on hold. An event is also registered to cleanup the bridge
             *  once all channels have left it.
             *
             *  @callback createBridgeCallback
             *  @memberof bridge-example
             *  @param {Error} err - error object if any, null otherwise
             *  @param {module:resources~Bridge} bridge - The bridge that
             *    was created
             */
            function (err, bridge) {

          bridge.on('ChannelLeftBridge', function(event, instances) {
            cleanupBridge(event, instances, bridge);
          });
          joinHoldingBridgeAndPlayMoh(bridge, channel);
        });
      } else {
        // Add incoming channel to existing holding bridge and play
        // music on hold
        joinHoldingBridgeAndPlayMoh(bridge, channel);
      }
    });
  }

  /**
   *  If no channel remains in the bridge, destroy it.
   *
   *  @callback channelLeftBridgeCallback
   *  @memberof bridge-example
   *  @param {Object} event - the full event object
   *  @param {Object} instances - bridge and channel
   *    instances tied to this channel left bridge event 
   *  @param {Bridge} bridge - the bridge the event is attached to
   */
  function cleanupBridge (event, instances, bridge) {

    var holdingBridge = instances.bridge;
    if (holdingBridge.channels.length === 0 &&
        holdingBridge.id === bridge.id) {

      bridge.destroy(function (err) {});
    }
  }

  /**
   *  Join holding bridge and play music on hold.
   *
   *  @function joinHoldingBridgeAndPlayMoh
   *  @memberof bridge-example
   *  @param {module:resources~Bridge} bridge -
   *    the holding bridge to add the channel to
   *  @param {module:resources~Channel} channel -
   *    the channel that entered Stasis
   */
  function joinHoldingBridgeAndPlayMoh (bridge, channel) {

    bridge.addChannel({channel: channel.id}, function (err) {
      channel.startMoh(function (err) {});
    });
  }

  // can also use ari.start(['app-name'...]) to start multiple applications
  ari.start('bridge-example');
});
