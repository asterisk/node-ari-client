/**
 *  This example shows how channel dtmf events can be used to playback sounds on
 *  a channel and to hangup the channel.
 *
 *  @namespace example
 *
 *  @copyright 2014, Digium, Inc.
 *  @license Apache License, Version 2.0
 *  @author Samuel Fortier-Galarneau <sgalarneau@digium.com>
 *  @example <caption>Dialplan</caption>
 *  exten => 7000,1,NoOp()
 *      same => n,Stasis(example)
 *      same => n,Hangup()
 */

'use strict';

/*global require:false*/
/*global process:false*/
/*jshint globalstrict: true*/

var client = require('ari-client');
var Promise = require('bluebird');
var util = require('util');

// replace ari.js with your Asterisk instance
client.connect('http://ari.js:8088', 'user', 'secret')
  .then(function (ari) {

    // Use once to start the application
    ari.on('StasisStart',
        /**
         *  Setup event listeners for dtmf events, answer channel that entered
         *  Stasis and play hello world greeting to the channel.
         *
         *  @callback stasisStartCallback
         *  @memberof example
         *  @param {Object} event - the full event object
         *  @param {module:resources~Channel} incoming -
         *    the channel that entered Stasis
         */
        function (event, incoming) {

      // Handle DTMF events
      incoming.on('ChannelDtmfReceived',
          /**
           *  Handle the dtmf event appropriately. # will hangup the channel,
           *  * will play a sound on the channel, and all digits will be played
           *  back on the channel.
           *
           *  @callback channelDtmfReceivedCallack
           *  @memberof example
           *  @param {Object} event - the full event object
           *  @param {module:resources~Channel} channel - the channel that
           *    received the dtmf event
           */
          function (event, channel) {

        var digit = event.digit;
        switch (digit) {
          case '#':
            play(channel, 'sound:vm-goodbye')
              .then(function () {
                return channel.hangup();
              })
              .finally(function () {
                process.exit(0);
              });
            break;
          case '*':
            play(channel, 'sound:tt-monkeys');
            break;
          default:
            play(channel, util.format('sound:digits/%s', digit));
        }
      });

      incoming.answer()
        .then(function () {
          play(incoming, 'sound:hello-world');
        })
        .catch(function (err) {});
    });

    /**
     *  Initiate a playback on the given channel.
     *
     *  @function play
     *  @memberof example
     *  @param {module:resources~Channel} channel - the channel to send the
     *    playback to
     *  @param {string} sound - the string identifier of the sound to play
     *  @returns {Q} promise - a promise that will resolve to the finished
     *                         playback
     */
    function play (channel, sound) {
      var playback = ari.Playback();

      return new Promise(function(resolve, reject) {
        playback.once('PlaybackFinished', function (event, playback) {
          resolve(playback);
        });

        channel.play({media: sound}, playback)
          .catch(function (err) {
            reject(err);
          });
      });
    }

    // can also use ari.start(['app-name'...]) to start multiple applications
    ari.start('example');
  })
  .done(); // program will crash if it fails to connect
