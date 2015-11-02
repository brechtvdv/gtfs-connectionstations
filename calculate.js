#!/usr/bin/node

var MongoClient = require('mongodb').MongoClient,
    fs = require('fs');

var DISTANCE_IN_METRES = 100;
var url = 'mongodb://localhost:27017/gtfs-connectionstations';

MongoClient.connect(url, function(err, db) {
  addToCSV('stop_id','connection_stop_id');
  findNonCalculatedStop(db, processStop);
});

var findNonCalculatedStop = function (db, callback) {
  db.collection('stations').findOne( {'connection_station': { '$exists': false}}, function(err, stop) {
    if (stop != null) {
      callback(db, stop);
    } else {
      // Empty the collection
      db.collection('stations').deleteMany( {}, function(err, results) {
        if (err){
          console.warn(err.message);
        }
        db.close();
      });
    } 
  });
};

var processStop = function (db, stop) {
  // Calculate for every stop its neighbours
  db.collection('stations').find(
    { loc :
      {
        $near : {
          $geometry : stop.loc, 
          $maxDistance : DISTANCE_IN_METRES
        }
      }
    }, {"sort": "priority"}).toArray(function(err, neighbours) {
    var amount = neighbours.length;
    var inserted = 0;

    var connectionStationId = neighbours[0]['stop_id'];
    var done = function() {
      inserted++;
      if (inserted == amount) {
        findNonCalculatedStop(db, processStop); // recursion for next
      }
    };

    for (var i=0; i<neighbours.length; i++) {
      if (neighbours.length > 1) {
        addToCSV(neighbours[i]['stop_id'], connectionStationId);
      }
      updateStop(db, neighbours[i]['stop_id'], connectionStationId, done);
    }
  });
};

var updateStop = function (db, stopId, connectionStationId, callback) {
  db.collection('stations').updateOne(
    { 'stop_id' : stopId },
    {
      $set: { 'connection_station':  connectionStationId}
    }, function(err, results) {
      callback();
    });
};

var addToCSV = function (original_stop_id, connection_stop_id) {
  var data = original_stop_id + ',' + connection_stop_id;
  // fs.appendFile('connection-stops.txt',data, encoding='utf8');
  console.log(data);
};