#!/usr/bin/node

var fs = require('fs'),
    unzip = require('unzip'),
    MongoClient = require('mongodb').MongoClient,
    Converter = require("csvtojson").Converter,
    through2 = require('through2'),
    GeoJSON = require('geojson');

var url = 'mongodb://localhost:27017/gtfs-connectionstations';

MongoClient.connect(url, function(err, db) {
  console.log("Connected correctly to server.");
  // Empty the collection
  db.collection('stations').deleteMany( {}, function(err, results) {
    if (err){
      console.warn(err.message);
    }
  });

  // Amount of feeds
  var amount = process.argv.slice(2).length;

  // Read GTFS feeds one by one
  process.argv.slice(2).forEach(function (feed, index, array) {
    var csvConverter = new Converter({constructResult:false});

    // Unzip
    var readstream = fs.createReadStream(feed);
    readstream.pipe(unzip.Parse())
    .on('entry', function (entry) {
      var fileName = entry.path;
      // Only interested in stops.txt
      if (fileName === "stops.txt") {
        // csv -> json -> mongoDB
        entry.pipe(csvConverter)
              .pipe(through2.obj(function (stop, enc, done) {
                // Convert to GeoJSON
                var newStop = [];
                newStop.push(JSON.parse(stop));
                var convertedStop = GeoJSON.parse(newStop, {Point: ['stop_lat', 'stop_lon'], include: ['stop_id']});
                // Insert into MongoDB
                db.collection('stations').insertOne(convertedStop, function() {
                  done();
                });
              }));
      } else {
        entry.autodrain();
      }
    });
    readstream.on('end', function() {
      // Amount aanpassen
      amount -= 1;
      if (amount == 0) {
        db.close();
      }
    })
    readstream.on('error', function (err) {
      console.error(err);
      db.close();
      process.exit();
    });
  });
});