#!/usr/bin/node

var MongoClient = require('mongodb').MongoClient,
    fs = require('fs');
var url = 'mongodb://localhost:27017/gtfs-connectionstops';
var AMOUNT = 100; // amount of queries
var DEPARTURETIME = "2015-10-05T08:00";
var STOPS;
var COUNT_STOPS;
var VARIABLE_NAME = "queriesNMBS"; // Change this to the variable you want to use in the demo

MongoClient.connect(url, function(err, db) {
  STOPS = db.collection("stops");
  STOPS.count(function(err, count) {
    COUNT_STOPS = count;

    console.log("var "+VARIABLE_NAME+" = [ ");

    generateRandomQuery(1, db);
  });
});

function generateRandomQuery(i, db) {
  // Select two random numbers between 0 and count-1
  var nr1 = getRandomInt(0,COUNT_STOPS);
  var nr2 = getRandomInt(0, COUNT_STOPS);

  // Fetch the corresponding stops
  STOPS.findOne({index:nr1}, function(err, stop1) {
    STOPS.findOne({index:nr2}, function(err, stop2) {
      var query = {
        "departureStop": stop1['stop_id'].toString(),
        "arrivalStop": stop2['stop_id'].toString(),
        "departureTime": DEPARTURETIME
      };
      console.log(query);
      // recursion
      i++;
      if (i < AMOUNT) {
        console.log(",");
        generateRandomQuery(i, db);
      } else {
        db.close();
        console.log("];");
      }
    });
  });
};

/**
 * Returns a random integer between min (inclusive) and max (inclusive)
 * Using Math.round() will give you a non-uniform distribution!
 */
function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
