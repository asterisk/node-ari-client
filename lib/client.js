/**
 *  Client to ARI instance behaving as an EventEmitter for web socket events.
 *  The client contains properties representing ARI resources. Those properties
 *  themselves will contain properties representing callable operations on those
 *  resources.
 *
 *  @module ari-client
 *
 *  @copyright 2014, Digium, Inc.
 *  @license Apache License, Version 2.0
 *  @author Samuel Fortier-Galarneau <sgalarneau@digium.com>
 */

'use strict';

/*global require:false*/
/*global module:false*/
/*jshint globalstrict: true*/

var util = require('util');
var url = require('url');
var events = require('events');
var WebSocket = require('ws');
var swagger = require('swagger-client');
var _ = require('underscore');
var backoff = require('backoff-func');

var _resources = require('./resources.js');
var _utils = require('./utils.js');

/**
 *  Client is an Event Emitter that allows root level resources
 *  to be accessed.
 *
 *  @class Client
 *  @constructor
 *  @param {string} url - The URL to the ARI instance
 *  @param {string} user - The username for the ARI instance
 *  @param {string} pass - The password for the ARI instance
 *  @prop {Connection} _connection - connection parts to an ARI instance
 *  @prop {Object} _instanceListeners - array of instance objects for
 *    instances that registered for scoped events keyed by event type
 */
function Client(baseUrl, user, pass) {
  var self = this;
  events.EventEmitter.call(self);

  // Store connection settings for prototype methods
  var parsedUrl = url.parse(baseUrl);
  /**
   * Connection parts to an ARI instance.
   *
   * @class Connection
   * @prop {string} protocol
   * @prop {string} host
   * @prop {string} hostname
   * @prop {string} user - username for ARI instance
   * @prop {string} pass - password for ARI instance
   */
  self._connection = {
    protocol: parsedUrl.protocol,
    host: parsedUrl.host,
    hostname: parsedUrl.hostname,
    user: user,
    pass: pass
  };

  // Keep track of instance event listeners. once true means that the callback
  // will only be called once for the given event.
  //
  // {
  //   'eventType': [{'once': false, 'id': uniqueId, 'callback': callback}...],
  //   ...
  // }
  self._instanceListeners = {};
}

// Make Client an Event Emitter
util.inherits(Client, events.EventEmitter);

/**
 *  Attaches the API endpoints and operations for those endpoints to the Client
 *  instance.
 *
 *  @memberof Client
 *  @method _attachApi
 *  @param {attachApiCallback} callback - callback invoked once API attached
 */
Client.prototype._attachApi = function (
    /**
     *  @callback attachApiCallback
     *  @memberof Client
     *  @param {Error} err - error object if any, null otherwise
     */
    callback) {

  var self = this;

  swagger.authorizations.add(
    'basic-auth',
    new swagger.PasswordAuthorization(
      self._connection.hostname,
      self._connection.user,
      self._connection.pass
    )
  );

  // Connect to API using swagger and attach resources on Client instance
  var ariUrl = util.format(
    '%s//%s/ari/api-docs/resources.json',
    self._connection.protocol,
    self._connection.host
  );
  self._swagger = new swagger.SwaggerApi({
    url: ariUrl,
    success: swaggerLoaded,
    failure: swaggerFailed
  });

  /**
   *  Success handler for swagger connect.
   *
   *  @callback swaggerConnectSuccessCallback
   *  @method swaggerLoaded
   *  @memberof module:ari-client~Client~_attachApi
   *  @private
   */
  function swaggerLoaded () {
    if(self._swagger.ready === true) {
      // Attach resources to client
      _.each(_.keys(self._swagger.apis), attachResource);

      // Attach resource creators to client
      _.each(_resources.knownTypes, attachResourceCreators);

      if (_.isFunction(callback)) {
        callback(null);
      }
    }
  }

  /**
   *  Failure handler for swagger connect.
   *
   *  @callback swaggerConnectFailureCallback
   *  @method swaggerFailed
   *  @memberof module:ari-client~Client~_attachApi
   *  @private
   */
  function swaggerFailed (err) {
    self.emit('APILoadError', err);
    if (_.isFunction(callback)) {
      callback(err);
    }
  }

  /**
   *  Attach resource creators to Client instance to enable id generation.
   *
   *  Optionally, a values object can be used to set certain values on the
   *  resource instance.
   *
   *  If the first argument is a string, it is used as an id.
   *
   *  @callback attachResourceCreatorsCallback
   *  @method attachResourceCreators
   *  @memberof module:ari-client~Client~_attachApi
   *  @private
   *  @param {string} resourceType - the type of the resource to setup a create
   *    method for
   */
  function attachResourceCreators (resourceType) {
    self[resourceType] = function (id, values) {
      return _resources[resourceType](self, id, values);
    };
  }

  /**
   *  Attach resources and operations to Client instance.
   *
   *  @callback attachResourceCallback
   *  @method attachResource
   *  @memberof module:ari-client~Client~_attachApi
   *  @private
   *  @param {string} resource - the name of the resource
   */
  function attachResource (resource) {
    self[resource] = {};
    var operations = self._swagger.apis[resource].operations;
    _.each(_.keys(operations), attachOperation);

    // Attach operation to resource
    function attachOperation (operation) {
      self[resource][operation] = callSwagger;

      var oper = self._swagger.apis[resource].operations[operation];
      var respType = oper.type;
      var multi = false;
      var regexArr = _resources.swaggerListTypeRegex.exec(respType);
      if (regexArr !== null) {
        respType = regexArr[1];
        multi = true;
      }
      var params = oper.parameters;

      /**
       *  Responsible for calling API through Swagger.
       *
       *  @callback attachResourceCallback
       *  @memberof module:ari-client~Client~_attachApi~attachResource
       *  @method callSwagger
       *  @private
       *  @param {Object} parameters - parameters to swagger
       *  @param {Function} callback - callback invoked with swagger response
       */
      function callSwagger (/* args..., callback */) {
        // Separate user callback from other args
        var args = _.toArray(arguments);
        var options = _.first(args);
        var userCallback = _.last(args);
        args = [];
        if (options === undefined || options === null ||
            _.isFunction(options) || _.isArray(options)) {
          options = {};
        } else {
          // Swagger can alter options passed in
          options = _.clone(options);
          // convert body params for swagger
          options = _utils.parseBodyParams(params, options);
        }

        args.push(options);
        // Inject response processing callback
        args.push(processResponse);
        // Inject error handling callback
        args.push(swaggerError);

        // Run operation against Swagger
        self._swagger.apis[resource][operation].apply(null, args);

        // Handle error from Swagger
        function swaggerError (err) {
          if (err && err.data) {
            err = new Error(err.data.toString('utf-8'));
          }
          userCallback(err);
        }

        /**
         *  Process response from Swagger.
         *
         *  @callback callSwaggerSuccessCallback
         *  @method processResponse
         *  @memberof
         *    module:ari-client~Client~_attachApi~attachResource~callSwagger
         *  @private
         *  @param {Object} response - response from swagger
         */
        function processResponse (response) {
          if (_.isFunction(userCallback)) {
            var result = response.data.toString('utf-8');
            if (respType !== null && result) {
              result = JSON.parse(result);
            }

            if (_.contains(_resources.knownTypes, respType) &&
                _resources[respType] !== undefined) {

              if (multi) {
                result = _.map(result, function (obj) {
                  return _resources[respType](
                    self,
                    obj
                  );
                });
              } else {
                result = _resources[respType](
                  self,
                  result
                );
              }
            }

            userCallback(null, result);
          }
        }
      }
    }
  }
};

/**
 *  Creates the web socket connection, subscribing to the given apps.
 *
 *  @memberof Client
 *  @method start
 */
Client.prototype.start = function (apps) {
  var self = this;

  // are we currently processing a WebSocket error?
  var processingError = false;

  var applications = (_.isArray(apps)) ? apps.join(',') : apps;
  var wsUrl = util.format(
    'ws://%s/ari/events?app=%s&api_key=%s:%s',
    self._connection.host,
    applications,
    self._connection.user,
    self._connection.pass
  );

  var retry = backoff.create({
    delay: 100
  });

  connect();

  /**
   *  Connects to the application via WebSocket.
   *
   *  @method connect
   *  @memberof module:ari-client~Client~start
   *  @private
   */
  function connect () {
    self._ws = new WebSocket(wsUrl);

    self._ws.on('message', processMessage);
    self._ws.on('open', processOpen);
    self._ws.on('close', processClose);
    self._ws.on('error', processError);
  }

  /**
   *  Process message received by web socket and emit event.
   *
   *  @method processMessage
   *  @memberof module:ari-client~Client~start
   *  @private
   *  @param {Object} msg - the web socket message
   *  @param {Object} flags - web socket control flags
   */
  function processMessage (msg, flags) {
    var event = {};
    if (msg) {
      event = JSON.parse(msg);
    }
    var eventModels = self._swagger.apis.events.models;
    var eventModel = _.find(eventModels, function (item, key) {
      return key === event.type;
    });
    var resources = {};
    var instanceIds = [];

    // Pass in any property that is a known type as an object
    _.each(eventModel.properties, function (prop) {
      if (_.contains(_resources.knownTypes, prop.dataType) &&
          event[prop.name] !== undefined &&
          _resources[prop.dataType] !== undefined) {

        var instance = _resources[prop.dataType](
          self,
          event[prop.name]
        );
        resources[prop.name] = instance;

        // Keep track of which instance specific events we should
        // emit
        var listeners = self._instanceListeners[event.type];
        var instanceId = instance._id().toString();

        if (listeners) {
          var updatedListeners = [];

          _.each(listeners, function(listener) {
            if (listener.id === instanceId) {
              // make sure we do not duplicate events for a given instance
              if (!_.contains(instanceIds, instanceId)) {
                instanceIds.push(instanceId);
              }

              // remove listeners that should only be invoked once
              if (!listener.once) {
                updatedListeners.push(listener);
              }
            } else {
              updatedListeners.push(listener);
            }
          });

          self._instanceListeners[event.type] = updatedListeners;
        }
      }
    });

    var promoted = _.keys(resources).length;
    if (promoted === 1) {
      resources = resources[_.keys(resources)[0]];
    } else if (promoted === 0) {
      resources = undefined;
    }

    self.emit(event.type, event, resources);
    // If appropriate, emit instance specific events
    if (instanceIds.length > 0) {
      _.each(instanceIds, function (instanceId) {
        self.emit(
          util.format('%s-%s', event.type, instanceId),
          event,
          resources
        );
      });
    }
  }

  /**
   *  Process open event.
   *
   *  @method processOpen
   *  @memberof module:ari-client~Client~start
   *  @private
   */
  function processOpen () {
    processingError = false;
  }

  /**
   *  Process close event. Attempt to reconnect to web socket with a back off
   *  to ensure we do not flood the server.
   *
   *  @method processClose
   *  @memberof module:ari-client~Client~start
   *  @private
   *  @param {Number} reason - reason code for disconnect
   *  @param {String} description - reason text for disconnect
   */
  function processClose (reason, description) {
    // was connection closed on purpose?
    if (self._wsClosed) {
      self._wsClosed = false;

      return;
    }

    if (!processingError) {
      reconnect();
    }
  }

  /**
   *  Process error event.
   *
   *  @method processError
   *  @memberof module:ari-client~Client~start
   *  @private
   *  @param {Error} err - error object
   */
  function processError (err) {
    // was connection closed on purpose?
    if (self._wsClosed) {
      return;
    }

    processingError = true;

    reconnect(err);
  }

  /**
   *  Attempts to reconnect to the WebSocket using a backoff function.
   *
   *  @method reconnect
   *  @memberof module:ari-client~Client~start
   *  @private
   *  @param {Error} err - error object
   */
  function reconnect(err) {
    var scheduled = retry(connect);

    if (!scheduled) {
      self.emit('WebSocketMaxRetries', err);
    }
  }
};

/**
 *  Closes the web socket connection.
 *
 *  @memberof Client
 *  @method stop
 */
Client.prototype.stop = function () {
  var self = this;

  self._ws.close();
  self._wsClosed = true;
};

/**
 *  Create an instance of Client using the provided connection options and call
 *  the provided callback once the API has been attached to the Client.
 *
 *  @method connect
 *  @memberof module:ari-client
 *  @param {string} url - The URL to the ARI instance
 *  @param {string} user - The username for the ARI instance
 *  @param {string} pass - The password for the ARI instance
 *  @param {Client-clientCallback} cb -
 *    The callback to be called upon connection
 */
module.exports.connect = function (baseUrl, user, pass,
    /**
     *  @callback connectCallback
     *  @memberof module:ari-client
     *  @param {Error} err - error object if any, null otherwise
     *  @param {Client} ari - ARI client instance
     */
    callback) {

  var client = new Client(baseUrl, user, pass);
  client.setMaxListeners(0);
  client._attachApi(function (err) {
    if (_.isFunction(callback)) {
      callback(err, client);
    } else {
      throw new Error('No callback provided to connect()');
    }
  });
};
