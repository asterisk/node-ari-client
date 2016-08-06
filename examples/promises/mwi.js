/**
 *  This example shows how mailbox counts (new/old messages) can be updated
 *  based on live recordings being recorded or played back.
 *
 *  @namespace mwi-example
 *
 *  @copyright 2014, Digium, Inc.
 *  @license Apache License, Version 2.0
 *  @author Samuel Fortier-Galarneau <sgalarneau@digium.com>
 *  @example <caption>Dialplan</caption>
 *  exten => 7000,1,NoOp()
 *      same => n,Stasis(mwi-example)
 *      same => n,Hangup()
 */

'use strict';

var client = require('ari-client');
var Promise = require('bluebird');
var util = require('util');

// replace ari.js with your Asterisk instance
client.connect('http://ari.js:8088', 'user', 'secret')
  .then(function (ari) {

    // Create new mailbox
    var mailbox = ari.Mailbox('mwi-example');
    var messages = 0;

    ari.on('StasisStart',
        /**
         *  Setup event listeners for dtmf events, answer channel that entered
         *  Stasis and play greeting telling user to either leave a message or
         *  play the next available message.
         *
         *  @callback stasisStartCallback
         *  @memberof mwi-example
         *  @param {Object} event - the full event object
         *  @param {module:resources~Channel} channel -
         *    the channel that entered Stasis
         */
        function (event, channel) {

      channel.on('ChannelDtmfReceived',
          /**
           *  Handle dtmf events. 5 records a message and 6 plays the last
           *  available message.
           *
           *  @callback channelDtmfReceivedCallback
           *  @memberof mwi-example
           *  @param {Object} event - the full event object
           *  @param {module:resources~Channel} channel - the channel that
           *    received the dtmf event
           */
          function (event, channel) {

        var digit = event.digit;
        switch (digit) {
          case '5':
            // Record message
            var opts = {
              format: 'wav',
              maxSilenceSeconds: '2',
              beep: true
            };

            record(channel, opts)
              .then(function () {
                return play(channel, 'sound:vm-msgsaved');
              })
              .then(function () {
                // Update MWI
                messages += 1;
                var opts = {
                  oldMessages: 0,
                  newMessages: messages
                };

                return mailbox.update(opts);
              })
              .then(function () {
                return channel.hangup();
              })
              .catch(function (err) {});
            break;
          case '6':
            // Playback last message
            ari.recordings.listStored()
              .then(function (recordings) {
                var recording = recordings[recordings.length - 1];

                if (!recording) {
                  return play(channel, 'sound:vm-nomore');
                } else {
                  // Play the latest message
                  var sound = util.format('recording:%s', recording.name);

                  return play(channel, sound)
                    .then(function () {
                      return recording.deleteStored();
                    })
                    .then(function () {
                      // Remove MWI
                      messages -= 1;
                      var opts = {
                        oldMessages: 0,
                        newMessages: messages
                      };

                      return mailbox.update(opts);
                    })
                    .then(function () {
                      return play(channel, 'sound:vm-next');
                    });
                }
              })
              .catch(function (err) {});
            break;
        }
      });

      channel.answer()
        .then(function () {
          return play(channel, 'sound:vm-leavemsg')
            .then(function () {
              return play(channel, 'sound:vm-next');
            });
        })
        .catch(function (err) {});
    });

    // TODO: do the same for record

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
        playback.once('PlaybackFinished',
            /**
             *  Once playback telling user how to leave a message has
             *  finished, play message telling user how to play the
             *  next available message.
             *
             *  @callback leaveMessageCallback
             *  @memberof mwi-example
             *  @param {Error} err - error object if any, null otherwise
             *  @param {module:resources~Playback} newPlayback -
             *    the playback object once it has finished
             */
            function (event, playback) {

          resolve(playback);
        });

        channel.play({media: sound}, playback)
          .catch(function (err) {
            reject(err);
          });
      });
    }

    /**
     *  Initiate a recording on the given channel.
     *
     *  @function record
     *  @memberof example
     *  @param {module:resources~Channel} channel - the channel to record
     *  @param {object} opts - options to be passed to the record function
     *  @returns {Q} promise - a promise that will resolve to the finished
     *                         recording
     */
    function record (channel, opts) {
      var recording = ari.LiveRecording();

      return new Promise(function(resolve, reject) {
        recording.once('RecordingFinished',
            /**
             *  Once the message has been recorded, play an announcement
             *  that the message has been saved and update the mailbox
             *  to show the new message count.
             *
             *  @callback recordingFinishedCallback
             *  @memberof mwi-example
             *  @param {Object} event - the full event object
             *  @param {module:resources~LiveRecording} newRecording -
             *    the recording object after creation
             */
            function (event, recording) {

          resolve(recording);
        });

        channel.record(opts, recording)
          .catch(function (err) {
            reject(err);
          });
      });
    }

    // can also use ari.start(['app-name'...]) to start multiple applications
    ari.start('mwi-example');
})
.done();  // program will crash if it fails to connect
