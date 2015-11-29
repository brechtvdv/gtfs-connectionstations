#!/usr/bin/node

var MongoClient = require('mongodb').MongoClient,
    fs = require('fs');

var DISTANCE_IN_METRES = 200;
var url = 'mongodb://localhost:27017/gtfs-connectionstops';
var stopsjsonfile = 'stops.js'; // Used for loading stops in demo
var stops = {}; // we'll make one big JSON object of all the stops, so we can access them directly by stop ID

MongoClient.connect(url, function(err, db) {
  addToCSV('stop_id','connection_stop_id');
  findNonCalculatedStop(db, processStop);
});

var findNonCalculatedStop = function (db, callback) {
  db.collection('stops').findOne( {'connection_stop_id': { '$exists': false}}, function(err, stop) {
    if (stop != null) {
      callback(db, stop);
    } else {
      // Empty the collection
      db.collection('stops').deleteMany( {}, function(err, results) {
        if (err){
          console.warn(err.message);
        }
        db.close();
        // Write JSON array to file
        fs.writeFile(stopsjsonfile, JSON.stringify(stops), function(err) {
          if(err) {
              return console.log(err);
          }
        }); 
      });
    } 
  });
};

var processStop = function (db, stop) {
  // Calculate for every stop its neighbours
  db.collection('stops').find(
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

    var connectionStopId = neighbours[0]['stop_id'];
    var done = function() {
      inserted++;
      if (inserted == amount) {
        findNonCalculatedStop(db, processStop); // recursion for next
      }
    };

    for (var i=0; i<neighbours.length; i++) {
      if (neighbours.length > 1) {
        addToCSV(neighbours[i]['stop_id'], connectionStopId);
      }
      updateStop(db, neighbours[i]['stop_id'], connectionStopId, done);
      var key = neighbours[i]['stop_id']; // index by stop ID
      var value = {};
      value.stop_name = neighbours[i]['stop_name'];
      value.loc = neighbours[i]['loc'];
      value.connection_stop_id = connectionStopId;
      stops[key] = value;
    }
  });
};

var updateStop = function (db, stopId, connectionStopId, callback) {
  db.collection('stops').updateOne(
    { 'stop_id' : stopId },
    {
      $set: { 'connection_stop_id':  connectionStopId}
    }, function(err, results) {
      callback();
    });
};

var addToCSV = function (original_stop_id, connection_stop_id) {
  var data = original_stop_id + ',' + connection_stop_id;
  // fs.appendFile('connection-stops.txt',data, encoding='utf8');
  console.log(data);
};


function writeJSONStopsToFile() {
  fs.writeFile(stopsjsonfile, stops, function(err) {
    if(err) {
        return console.log(err);
    }

    console.log("The file was saved!");
  }); 
}