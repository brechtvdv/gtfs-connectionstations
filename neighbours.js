#!/usr/bin/node

var MongoClient = require('mongodb').MongoClient,
unzip = require('unzip'),
Converter = require("csvtojson").Converter,
fs = require('fs');

var DRS_COLLECTION = "drscollection"; // Direct reachable stops
var NEIGHBOURS_COLLECTION = "neighbours"; // Direct and indirect reachable stops
var K = 8; // connection radius

var stops = JSON.parse(require('fs').readFileSync('stops.json', 'utf8'));

var reload_drs = true; // reload DRS stops in MongoDB

initMOBcalculation();

// Updates every stop of stops with count of direct reachable stops
function initCountDRS(drs, feed, callback) {
    var csvConverter = new Converter({constructResult:false});
    var readstream = fs.createReadStream(drs).pipe(csvConverter);
    var departureStop = null;
    var done = false;
    var count_drs = 0;
    readstream.on('data', function (data) {
      var line = JSON.parse(data);
      // console.log(line);
      var start = line['start_stop_id'];
      var end = line['end_stop_id'];
      var time = line['minimum_time_seconds'];
      if (departureStop == null || departureStop != start) {
        if (departureStop != null) {
          stops[departureStop].count_direct_stops = count_drs; // update the stops object
        }
        count_drs = 0; // reset
        departureStop = start; // update
      }
      count_drs++;
    });
    readstream.on('end', function () {
      // Write last one
      stops[departureStop].count_direct_stops = count_drs; // update the stops object
      console.log("<<<<<<<<<<<<DONE READING COUNT DRS>>>>>>>>>>>>>>>>> ");
      callback();
    });
}

// Calculates a MOB of neighbouring stops for every stop of a feed
function startMOBcalculation(drs, url, feed, callback) {
  // First read the DRS file to update stops with metadata about amount of direct stops
  initCountDRS(drs, feed, function() {
    // Read DRS into direct_reachable_stops collection
    MongoClient.connect(url, function(err, db) {
      console.log("Connected correctly to server.");
      // Empty the collection
      db.collection(NEIGHBOURS_COLLECTION).deleteMany( {}, function(err, results) {
        if (err) {
          console.warn(err.message);
        }
      });
      if (reload_drs) {
        console.log("<<<<<<<<<<<<LOADING DRS>>>>>>>>>>>>>>>>> ")
        db.collection(DRS_COLLECTION).deleteMany( {}, function(err, results) {
          if (err) {
            console.warn(err.message);
          }
        });

        var csvConverter = new Converter({constructResult:false});
        var readstream = fs.createReadStream(drs).pipe(csvConverter);
        var departureStop = null;
        var readingEnded = false;
        var i = 0;
        var j = 0;
        var count_drs = 0;
        readstream.on('data', function (data) {
          var line = JSON.parse(data);
          // console.log(line);
          var start = line['start_stop_id'].toString();
          var end = line['end_stop_id'].toString();
          var time = line['minimum_time_seconds'];
          count_drs++;
          if (departureStop == null || departureStop.stop_id != start || (count_drs == stops[start].count_direct_stops)) {
            if (departureStop != null) {
              i++;
              departureStop.count_direct_stops = count_drs;
              count_drs = 0; // reset
              // Write to collection
              db.collection(DRS_COLLECTION).insertOne(departureStop, function() {
                j++;
                if (i === j+1 && readingEnded) {
                  i = 0;
                  j = 0;
                  readingEnded = false;
                  // Start neighbours algorithm on every stop of the feed
                  console.log("<<<<<<<<<<<<START MOB CALCULATION>>>>>>>>>>>>>>>>> ")
                  calcNeighbours(feed, db, callback);
                }
              });
            }
            // New starting departureStop
            departureStop = {
              stop_id : start.toString(),
              drs : [ { stop_id: end.toString(), timedistance : time } ]
            };
          } else {
            departureStop.drs.push({stop_id: end.toString(), timedistance: time});
          }
        });
        readstream.on('end', function () {
          readingEnded = true;
        });
      } else {
        calcNeighbours(feed, db, callback);
      }
    });
  });
}

function calcNeighbours(feed, db, callback) {
  var readingEnded = false;
  // For every stop in Stops.txt
  var csvConverter = new Converter({constructResult:false});
  var readstream = fs.createReadStream(feed);
  readstream.pipe(unzip.Parse())
  .on('entry', function (entry) {
    var fileName = entry.path;
    // Only interested in stops.txt
    if (fileName === "stops.txt") {
      // csv -> json -> mongoDB
      var stopStream = entry.pipe(csvConverter);
      // 2.1 Algorithm
      stopStream.on('data', function(data) {
        // Pause the stopStream
        stopStream.pause();
        var line = JSON.parse(data);
        console.log(line['stop_id']);
        // Convert to connection_stop_id
        var s = stops[line['stop_id']].connection_stop_id.toString();
        var mob = {stop_id: s.toString(), neighbours: {}};
        var queue = [];
        // Rechtstreekse buren ophalen
        db.collection(DRS_COLLECTION).find({ stop_id : s }).toArray(function(err, neighbours) {
          // Add the coordinates of the center to the MOB
          var coordinates = stops[s].loc.coordinates;
          var lon = coordinates[0];
          var lat = coordinates[1];
          mob.longitude = lon;
          mob.latitude = lat;
          if (neighbours && neighbours.length > 0) {
            for (var i = 0; i < neighbours[0].drs.length; i++) {
              var b = neighbours[0].drs[i];
              // We'll save the coordinates too so the fetcher of a client can easily calculate the importance of a stop
              var coordinates = stops[b.stop_id].loc.coordinates;
              var lon = coordinates[0];
              var lat = coordinates[1];
              mob.neighbours[b.stop_id] = { radius: 1, timedistance: b.timedistance, count_direct_stops: neighbours[0].count_direct_stops, latitude: lat, longitude: lon};
              mob.count_direct_stops = neighbours[0].count_direct_stops;
              if (K > 1) {
                queue.push(b.stop_id);
              }
            }
            loadDRSRecursion(stopStream, db, mob, queue, readingEnded, callback);
          } else {
            // the stop is not used in the time period of the calculated connections
            stopStream.resume();
          }
        });
      });
      stopStream.on('end', function () {
        readingEnded = true;
      });
    } else {
      entry.autodrain();
    }
  });
};

function loadDRSRecursion(stopStream, db, mob, queue, readingEnded, cb) {
  if (queue.length > 0) {
    var start = queue.shift();
    loadDRS(stopStream, db, start, mob, queue);
  } else if (readingEnded){
    db.collection(NEIGHBOURS_COLLECTION).insertOne(mob, function(err, result) {
      db.close();
      cb(); // starts next feed
    });
  } else {
    // 2.2 Write MOB to neighbours collection
    db.collection(NEIGHBOURS_COLLECTION).insertOne(mob, function(err, result) {
      // Next stop
      stopStream.resume();
    });
  }
};

function loadDRS(stopStream, db, start, mob, queue) {
  db.collection(DRS_COLLECTION).find({ stop_id : start }).toArray(function(err, neighbours) {
    if (neighbours && neighbours.length > 0) {
      for (var i = 0; i < neighbours[0].drs.length; i++) {
        var b = neighbours[0].drs[i];
        // Not in MST/MOB
        if (!mob.neighbours[b.stop_id]) {
          var cds = stops[b.stop_id].count_direct_stops; // should be defined, otherwise not driving on the connection dates
          if (!cds) cds = 0;
          var coordinates = stops[b.stop_id].loc.coordinates;
          var lon = coordinates[0];
          var lat = coordinates[1];
          mob.neighbours[b.stop_id] = {radius: (mob.neighbours[start].radius+1), timedistance: (mob.neighbours[start].timedistance+b.timedistance), count_direct_stops: cds, latitude: lat, longitude: lon};
          if (mob.neighbours[b.stop_id].radius < K) {
            queue.push(b.stop_id);
          }
        } else {
          if ((mob.neighbours[start].radius + 1) < mob.neighbours[b.stop_id].radius) {
            mob.neighbours[b.stop_id].radius = mob.neighbours[start].radius + 1;
          }
          if ((mob.neighbours[start].timedistance + b.timedistance) < mob.neighbours[b.stop_id].timedistance) {
            mob.neighbours[b.stop_id].timedistance = mob.neighbours[start].timedistance + b.timedistance;
          }
        }
      }
    }
    // Continue
    loadDRSRecursion(stopStream, db, mob, queue);
  });
};

function initMOBcalculation() {
  // Feed De Lijn
  // var DRS_DELIJN = 'drs-1.txt'; // path to drs file of De Lijn
  // var URL_CONTAINER_DELIJN = 'mongodb://192.168.99.100:28002/lc'; // url to docker container with MongoDB
  // var PATH_FEED_DELIJN = '../collectie-gtfs/de_lijn-gtfs.zip'; // path GTFS feed
  // startMOBcalculation(DRS_DELIJN, URL_CONTAINER_DELIJN, PATH_FEED_DELIJN, function() {
    // Feed NMBS
    var DRS_NMBS = 'drs-NMBS-SNCB.txt';
    var URL_CONTAINER_NMBS = 'mongodb://192.168.99.100:28001/lc';
    var PATH_FEED_NMBS = '../collectie-gtfs/GTFS_20150915.zip';
    startMOBcalculation(DRS_NMBS, URL_CONTAINER_NMBS, PATH_FEED_NMBS, function() {
      // Feed NS
      var DRS_NS = 'drs-100.txt';
      var URL_CONTAINER_NS = 'mongodb://192.168.99.100:28003/lc';
      var PATH_FEED_NS = '../collectie-gtfs/gtfs-iffns-latest.zip';
      startMOBcalculation(DRS_NS, URL_CONTAINER_NS, PATH_FEED_NS, function() {});
    });
  // });
};
