# GTFS connection stations

-- Work in progress --

This project calculates for every cluster of stops of different feeds one `connection_station`. This way, [Linked Connections](http://linkedconnections.org) can be calculated that enable interoperability between different operators.

The result will be a CSV file with the original `stop_id` and new `connection_station` fields.
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
The stops will be loaded inside `gtfs-connectionstations` collection of MongoDB.

```bash
node load_stops.js feed1.zip feed2.zip feedX.zip
```

## Calculate connection stations

The script `calculate.js` uses a default distance between stops that are possible.

```bash
node calculate.js
```
