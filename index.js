#!/usr/bin/env node

var exec = require('shelljs').exec;
var async = require('async');
var FirefoxClient = require('firefox-client');
var os = process.platform;
var NETSTAT_CMD = 'netstat -lnptu';
var LSOF_CMD = 'lsof -i -n -P -sTCP:LISTEN';

module.exports = discoverPorts;

function discoverPorts (opts, callback) {
  
  opts = opts || {};
  var ports = [];
  var search = [];

  if (!opts.firefox && !opts.b2g && !opts.adb) {
    search = ['firefox', 'b2g', 'adb'];
  }
  if (opts.firefox) search.push('firefox');
  if (opts.b2g) search.push('b2g');
  if (opts.adb) search.push('adb');

  if (opts.release && opts.release.length > 0) opts.detailed = true;

  /* Commands */

  if (os == 'darwin') {
    var output = exec(LSOF_CMD, {silent: true}).output;
    // Example to match
    // b2g-bin   25779 mozilla   21u  IPv4 0xbbcbf2cee7ddc2a7      0t0  TCP 127.0.0.1:8000 (LISTEN)
    var regex = new RegExp("^("+ search.join('|') +")(?:-bin)?[\\ ]+([0-9]+).*[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+:([0-9]+)");
    var lines = output.split('\n');
    lines.forEach(function(line) {
      var matches = regex.exec(line);
      if (matches && +matches[3] != 2828 && +matches[3] != 5037) {
        ports.push({type: matches[1], port: +matches[3], pid: +matches[2]});
      }
    });

  } else
  if (os == 'linux') {
    var output = exec(NETSTAT_CMD, {silent: true}).output;
    // Example to match
    // tcp        0      0 127.0.0.1:6000          0.0.0.0:*              LISTEN      3718/firefox 
    var regex = new RegExp("tcp.*[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+:([0-9]+).*LISTEN[\\ ]+([0-9]+)\\/("+ search.join('|') +")(?:-bin)?");
    var lines = output.split('\n');
    lines.forEach(function(line) {
      var matches = regex.exec(line);
      if (matches && +matches[1] != 2828 && +matches[1] != 5037) {
        ports.push({type: matches[3], port: +matches[1], pid: +matches[2],});
      }
    });

  } else {
    return callback(new Error("OS not supported for running"));
  }

  if (opts.detailed) {
    async.map(ports, discoverDevice, function(err, results) {
      if (!opts.release)
        return callback(err, results);

      if (typeof opts.release == 'string')
        opts.release = [opts.release];

      callback(err, results.filter(function(instance) {
        var regex = new RegExp("^(" + opts.release.join('|') + ")");
        return regex.exec(instance.device.version);
      }));

    });
  } else {
    callback(null, ports);
  }
}

function discoverDevice (instance, callback) {
  var client = new FirefoxClient();
  client.connect(instance.port, function() {
    client.getDevice(function(err, device) {
      device.getDescription(function(err, deviceDescription) {
        instance.device = deviceDescription;
        instance.release = deviceDescription.version;
        client.disconnect();
        callback(null, instance);
      });
    });
  });
}