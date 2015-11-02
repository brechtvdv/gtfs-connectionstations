var Transform = require('stream').Transform,
    util = require('util');

/**
 * Add priority number to objects of the feed
 */
function AddFeedPriorityTransformer (number) {
  Transform.call(this, {objectMode : true});
  this._number = number;
}

util.inherits(AddFeedPriorityTransformer, Transform);

AddFeedPriorityTransformer.prototype._transform = function (obj, encoding, done) {
  var objJson = JSON.parse(obj);
  objJson['priority'] = this._number;
  this.push(objJson);
  done();
};

module.exports = AddFeedPriorityTransformer;