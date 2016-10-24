/**
 *  Grunt tasks to support running linter, unit tests, and generating
 *  documentation.
 *
 *  @module GruntFile
 *
 *  @copyright 2014, Digium, Inc.
 *  @license Apache License, Version 2.0
 *  @author Samuel Fortier-Galarneau <sgalarneau@digium.com>
 */

'use strict';

module.exports = function(grunt) {

  // Project configuration.
  grunt.initConfig({
    gendocs: {
      options: {
        baseUrl: 'http://ari.js:8088',
        username: 'user',
        password: 'secret'
      }
    },

    genfixtures: {
      options: {
        baseUrl: 'http://ari.js:8088',
        username: 'user',
        password: 'secret'
      }
    },

    jsdoc : {
      dist : {
        src: [
          'lib/*.js',
          'examples/*.js',
          'test/*.js',
          'Gruntfile.js',
          'README.md'
        ],
        options: {
          destination: 'doc'
        }
      }
    }
  });

  // These plugins provide necessary tasks.
  grunt.loadNpmTasks('grunt-jsdoc');

  // Default task.
  grunt.registerTask('default', ['gendocs']);

  grunt.registerTask(
      'gendocs',
      'Generate operations and events documentation.',
      function () {

    var done = this.async();
    var options = this.options({});

    var swagger = require('swagger-client');
    var url = require('url');
    var util = require('util');
    var fs = require('fs');
    var mustache = require('mustache');
    var _ = require('underscore');
    var resourcesLib = require('./lib/resources.js');

    var operations = '';
    var events = '';

    var operationTemplate = fs.readFileSync(
      './dev/operation.mustache',
      'utf-8'
    );
    var eventTemplate = fs.readFileSync(
      './dev/event.mustache',
      'utf-8'
    );

    var parsedUrl = url.parse(options.baseUrl);
    swagger.authorizations.add(
      'basic-auth',
      new swagger.PasswordAuthorization(
        parsedUrl.hostname,
        options.username,
        options.password
      )
    );

    // Connect to API using swagger and attach resources on Client instance
    var resourcesUrl = util.format(
      '%s//%s/ari/api-docs/resources.json',
      parsedUrl.protocol,
      parsedUrl.host
    );
    var swaggerClient = new swagger.SwaggerApi({
      url: resourcesUrl,
      success: swaggerLoaded,
      failure: swaggerFailed
    });

    // Swagger success callback
    function swaggerLoaded () {
      if(swaggerClient.ready === true) {
        grunt.log.writeln('generating operations documentation');

        var apis = _.sortBy(_.keys(swaggerClient.apis));
        _.each(apis, generateOperations);

        grunt.log.writeln('generating events documentation');

        var models = _.sortBy(_.keys(swaggerClient.apis.events.models));
        _.each(models, generateEvents);

        var template = fs.readFileSync('./dev/README.mustache', 'utf-8');
        var output = mustache.render(template, {
          operations: operations,
          events: events
        });
        fs.writeFileSync('./README.md', output, 'utf-8');

        done();
      }
    }

    // Swagger failure callback
    function swaggerFailed (err) {
      grunt.log.error(err);
      done(false);
    }

    // Generate all operations
    function generateOperations (resource) {
      if (resource !== 'events') {
        operations += util.format('#### %s\n\n', resource);
        var api = swaggerClient.apis[resource];
        var ops = _.sortBy(_.keys(api.operations));

        _.each(ops, function (name) {
          var operation = api.operations[name];
          var results = '';
          if (operation.type !== null) {
            var returnType = operation.type;
            var regexArr =
              resourcesLib.swaggerListTypeRegex.exec(returnType);

            if (regexArr !== null) {
              returnType = util.format('%ss', regexArr[1]);
            }
            returnType = returnType.toLowerCase();

            results += util.format(', %s', returnType);
          }
          var params = '';
          var paramsPromises = '';
          var requiredParams = [];
          var availableParams = [];
          var parameters = _.sortBy(operation.parameters, 'name');
          _.each(parameters, function (param) {
            if (param.required) {
              requiredParams.push(
                util.format('%s: val', param.name)
              );
            }

            availableParams.push(
              util.format(
                '- %s (%s) - %s',
                param.name,
                param.type,
                param.description
              )
            );
          });
          if (requiredParams.length > 0) {
            params = util.format(
              '{%s}', requiredParams.join(', ')
            );
            params += ',\n  ';

            paramsPromises = util.format(
              '{\n    %s\n}', requiredParams.join(',\n    ')
            );
          }

          operations += mustache.render(operationTemplate, {
            name: name,
            desc: operation.summary,
            resource: operation.resourceName,
            params: params,
            paramsPromises: paramsPromises,
            results: results,
            resultsPromises: results.substring(2)
          });

          if (availableParams.length > 0) {
            operations += util.format(
              '###### Available Parameters\n%s\n\n',
              availableParams.join('\n')
            );
          }
        });
      }
    }

    // Generate all events
    function generateEvents (name) {
      if (name !== 'Event' && name !== 'Message') {
        var event = swaggerClient.apis.events.models[name];
        var results = '';
        var props = _.sortBy(event.properties, 'name');

        var availableProps = [];
        var promoted = [];
        var instances = [];
        _.each(props, function (prop) {
          var propType = prop.dataType;
          var regexArr =
            resourcesLib.swaggerListTypeRegex.exec(propType);

          if (regexArr !== null) {
            propType = util.format('%s', regexArr[1]);
          }

          if (_.contains(resourcesLib.knownTypes, propType)) {
            promoted.push(prop.name);
            if (!_.contains(instances, propType)) {
              instances.push(propType);
            }
          }

          availableProps.push(
            util.format(
              '- %s (%s) - %s',
              prop.name,
              prop.dataType,
              prop.descr
            )
          );
        });

        if (promoted.length > 1) {
          results += util.format(', {%s: val}', promoted.join(': val, '));
        } else if (promoted.length === 1) {
          results += util.format(', %s', promoted[0]);
        }

        events += mustache.render(eventTemplate, {
          name: name,
          desc: swaggerClient.apis.events.rawModels[name].description,
          results: results
        });

        if (availableProps.length > 0) {
          events += util.format(
            '###### Available Event Properties\n%s\n\n',
            availableProps.join('\n')
          );
        }

        if (instances.length > 0) {
          events += util.format(
            '###### Resource Specific Emitters\n%s\n\n',
            instances.join('\n')
          );
        }
      }
    }
  });

  grunt.registerTask(
      'genfixtures',
      'Generate fixtures from ARI for unit tests.',
      function () {

    var taskDone = this.async();
    var options = this.options({});

    var request = require('request');
    var fs = require('fs');
    var util = require('util');
    var async = require('async');

    var fixtures = [
      'resources',
      'sounds',
      'recordings',
      'playbacks',
      'mailboxes',
      'events',
      'endpoints',
      'deviceStates',
      'channels',
      'bridges',
      'asterisk',
      'applications',
    ];

    // generate all fixtures in parallel
    async.each(fixtures, loadFixtureJson, taskDone);

    // loads a given fixture from an ARI definition json file
    function loadFixtureJson (fixtureName, done) {
      grunt.log.writeln(
        util.format('generating fixture for %s', fixtureName)
      );

      var url = util.format(
        '%s/ari/api-docs/%s.json?api_key=%s:%s',
        options.baseUrl,
        fixtureName,
        options.username,
        options.password
      );
      request(url, function (err, resp, body) {
        var filename = util.format(
          '%s/test/fixtures/%s.json',
          __dirname,
          fixtureName
        );
        var content = body.replace(/ari\.js/g, 'localhost');
        fs.writeFileSync(filename, content);

        done();
      });
    }
  });
};
