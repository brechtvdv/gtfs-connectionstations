# GTFS connection stations

-- Work in progress --

This project maps stops from different feeds to one ID, together they form a `connection_station`. This way, [Linked Connections](http://linkedconnections.org) can be calculated that enable interoperability between different operators.

The result will be a CSV file with the original `stop_id` and new `connection_stop_id` fields.
(gtfs2connections)[https://github.com/brechtvdv/gtfs2connections] uses this file to map stops of different transit operators to one "parent" stop.

Note: this is just a quick solution to avoid GTFS footpaths for my thesis.

## Requirements

* MongoDB
* NodeJS

## Install

* Clone this project
* Install depencies: `npm install`

## Load stops.txt

Specify paths to zipped GTFS feeds that you want to calculate parent stations (called connection stations) for.
It's important to note that the order of the feeds you specify is used in the ID selection process. If you want the connection station ID taken from feed2.zip then you have to put it first.

The stops will be loaded inside `gtfs-connectionstations` collection of MongoDB.

```bash
node load_stops.js feed1.zip feed2.zip feedX.zip
```

## Calculate connection stations

The script `calculate.js` uses a default distance of 100 metres as metric for footpaths.

```bash
node calculate.js > connection-stops.txt
```

After calculation, the collection is removed so you have to run load_stops.js again to restart.
