#!/usr/bin/node

var fs = require('fs'),
    unzip = require('unzip'),
    MongoClient = require('mongodb').MongoClient,
    Converter = require("csvtojson").Converter,
    AddFeedPriorityTransformer = require('./AddFeedPriorityTransformer'),
    through2 = require('through2');

var url = 'mongodb://localhost:27017/gtfs-connectionstops';

MongoClient.connect(url, function(err, db) {
  console.log("Connected correctly to server.");
  // Empty the collection
  db.collection('stops').deleteMany( {}, function(err, results) {
    if (err){
      console.warn(err.message);
    }
  });

  // Create 2dsphere index for proximity locating
  db.collection('stops').createIndex( { loc : "2dsphere" } );

  // Amount of feeds
  var amount = process.argv.slice(2).length;
  var numberOfFeed = 1; // Current feed number in order of arguments

  // Read GTFS feeds one by one
  process.argv.slice(2).forEach(function (feed, index, array) {
    var csvConverter = new Converter({constructResult:false});
    var feedPriorityTransformer = new AddFeedPriorityTransformer(numberOfFeed);
    numberOfFeed++;

    var i = 0; // keeps track of amount of stops that are read
    var j = 0; // keeps track of amount of stops that are inserted in mongo
    var readingEnded = false;

    // Unzip
    var readstream = fs.createReadStream(feed);
    readstream.pipe(unzip.Parse())
    .on('entry', function (entry) {
      var fileName = entry.path;
      // Only interested in stops.txt
      if (fileName === "stops.txt") {
        // csv -> json -> mongoDB
        var stopStream = entry.pipe(csvConverter);
        stopStream.on('data', function() {
          i++;
        }).on('end', function() {
          readingEnded = true;
        });

        stopStream.pipe(feedPriorityTransformer).pipe(through2.obj(function (stop, enc, done) {
          // Add GeoJSON location
          stop.loc = {
            type: "Point" ,
            coordinates: [ stop['stop_lon'] , stop['stop_lat'] ]
          };
          // Insert into MongoDB
          db.collection('stops').insertOne(stop, function() {
            j++;
            // All read and inserted
            if (i === j && readingEnded) {
              // Amount aanpassen
              amount -= 1;
              if (amount == 0) {
                db.close();
              }
            }
            done();
          });
        }));
      } else {
        entry.autodrain();
      }
    });
    readstream.on('error', function (err) {
      console.error(err);
      db.close();
      process.exit();
    });
  });
});
