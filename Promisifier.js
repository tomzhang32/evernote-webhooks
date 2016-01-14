/**
 * Basic converter from Node callback-style functions to functions that return an
 * ES2015 Promise.
 *
 * Based loosely on the implementation in Bluebird.js:
 *  https://github.com/petkaantonov/bluebird
 */
var Promisifier = {
  /**
   * Promisifies all functions in an object. Be careful - this assumes that all functions
   * in the object expect a callback as the last argument, and that the callback accepts
   * arguments of error and data, respectively. Does not recursively promisify nested
   * objects, nor functions on the prototype.
   *
   * @param object The object to promisify
   * @return a new object with the same keys, but with all the functions having been
   *        promisified (see promisifyFunction below)
   */
  promisifyObject: function(object) {
    var promisified = {};
    var keys = Object.keys(object);
    for (var i in keys) {
      var key = keys[i]
      if (typeof object[key] === 'function') {
        promisified[key] = this.promisifyFunction(object[key], object);
      } else {
        promisified[key] = object[key];
      }
    }
    return promisified;
  },

  /**
   * Promisifies a given function. Be careful - this assumes that said function expects a
   * callback as the last argument, and that the callback accepts arguments of error and
   * data, respectively.
   *
   * @param fn The function to convert to return a Promise
   * @param context optional Object to use as thisArg when invoking the wrapped function
   * @return a function that calls fn and returns a Promise. The Promise will be resolved
   *        if fn calls the callback without errors, or rejected otherwise.
   */
  promisifyFunction: function(fn, context) {
    return function() {
      var args = arguments;
      var promise = new Promise(function(resolve, reject) {
        // callback to reject the promise on error, or resolve with the data
        var promiser = function(error, data) {
          if (error) {
            reject(error);
          } else {
            resolve(data);
          }
        };

        // extend the arguments with the callback
        var argsLen = args.length;
        var argsArray = new Array(argsLen + 1);
        for (var i = 0; i < argsLen; ++i) {
            argsArray[i] = args[i];
        }
        argsArray[argsLen] = promiser;
        fn.apply((context ? context : this), argsArray);
      });
      return promise;
    }
  }
};

module.exports = Promisifier;