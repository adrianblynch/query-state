(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.queryState = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/**
 * Allows application to access and update current app state via query string
 */
module.exports = queryState;

var eventify = require('ngraph.events');
var windowHashHistory = require('./lib/windowHashHistory.js');

function queryState(defaults, history) {
  history = history || windowHashHistory(defaults);
  validateHistoryAPI(history);

  history.onChanged(updateQuery)

  var query = history.get() || Object.create(null);

  var api = {
    get: getValue,
    set: setValue,
    dispose: dispose,
    getHistoryObject: getHistoryObject,
    onChange: onChange,
    offChange: offChange
  }

  var eventBus = eventify({});

  return api;

  function onChange(callback, ctx) {
    eventBus.on('change', callback, ctx);
  }

  function offChange(callback, ctx) {
    eventBus.off('change', callback, ctx)
  }

  function getHistoryObject() {
    return history;
  }

  function dispose() {
    // dispose all history listeners
    history.dispose();

    // And remove our own listeners
    api.off();
  }

  function getValue(keyName) {
    if (keyName === undefined) return query;

    return query[keyName];
  }

  function setValue(keyName, value) {
    var keyNameType = typeof keyName;

    if (keyNameType === 'object') {
      Object.keys(keyName).forEach(function(key) {
        query[key] = keyName[key];
      });
    } else if (keyNameType === 'string') {
      query[keyName] = value;
    }

    history.set(query);
  }

  function updateQuery(query) {
    eventBus.fire('change', query);
  }
}

function validateHistoryAPI(history) {
  if (!history) throw new Error('history is required');
  if (typeof history.dispose !== 'function') throw new Error('dispose is required');
  if (typeof history.onChanged !== 'function') throw new Error('onChanged is required');
}

},{"./lib/windowHashHistory.js":4,"ngraph.events":5}],2:[function(require,module,exports){
/**
 * Provides a `null` object that matches history API
 */
module.exports = nullHistory;

function nullHistory(defaults) {
  var listeners = [];
  var lastQueryObject = defaults;

  return {
    dispose: dispose,
    onChanged: onChanged,
    set: set,
    get: get
  };

  function get() {
    return lastQueryObject;
  }

  function set(newQueryObject) {
    lastQueryObject = newQueryObject;
    setTimeout(function() {
      triggerChange(newQueryObject);
    }, 0);
  }

  function dispose() {
    listeners = [];
  }

  function onChanged(changeCallback) {
    listeners.push(changeCallback);
  }

  function triggerChange(appState) {
    listeners.forEach(function(listener) {
      listener(appState);
    });
  }
}

},{}],3:[function(require,module,exports){
/**
 * This module is similar to JSON, but it encodes/decodes in query string
 * format `key1=value1...`
 */
module.exports = {
  parse: parse,
  stringify: stringify
};

function stringify(object) {
  if (!object) return '';

  return Object.keys(object).map(toPairs).join('&');

  function toPairs(key) {
    var value = object[key];
    var pair = encodeURIComponent(key);
    if (value !== undefined) {
      pair += '=' + encodeValue(value);
    }

    return pair;
  }
}

function parse(queryString) {
  var query = Object.create(null);

  if (!queryString) return query;

  queryString.split('&').forEach(decodeRecord);

  return query;

  function decodeRecord(queryRecord) {
    if (!queryRecord) return;

    var pair = queryRecord.split('=');
    query[decodeURIComponent(pair[0])] = decodeValue(pair[1]);
  }
}

function encodeValue(value) {
  // TODO: Do I need this?
  // if (typeof value === 'string') {
  //   if (value.match(/^(true|false)$/)) {
  //     // special handling of strings that look like booleans
  //     value = JSON.stringify('' + value);
  //   } else if (value.match(/^-?\d+\.?\d*$/)) {
  //     // special handling of strings that look like numbers
  //     value = JSON.stringify('' + value);
  //   }
  // }
  if (value instanceof Date) {
    value = value.toISOString();
  }
  var uriValue = encodeURIComponent(value);
  return uriValue;
}

/**
 * This method returns typed value from string
 */
function decodeValue(value) {
  value = decodeURIComponent(value);
  if (!isNaN(value)) {
    return parseFloat(value);
  }
  if (isBolean(value)) {
    return value === 'true';
  }
  if (isISODateString(value)) {
    return new Date(value);
  }

  return value;
}

function isBolean(strValue) {
  return strValue === 'true' || strValue === 'false';
}

function isISODateString(str) {
  return str && str.match(/(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))/)
}

},{}],4:[function(require,module,exports){
/**
 * Uses `window` to monitor hash and update hash
 */
module.exports = windowHistory;

var nullHistory = require('./nullHistory.js');
var query = require('./query.js');

function windowHistory(defaults) {
  // If we don't support window, we are probably running in node. Just return
  // `null` object
  if (typeof window === 'undefined') return nullHistory(defaults);

  // Store all `onChanged()` listeners here, so that we can have just one
  // `hashchange` listener, and notify one listeners within single event.
  var listeners = [];

  // This prefix is used for all query strings. So our state is stored as
  // my-app.com/#?key=value
  var hashPrefix = '#?';

  init();

  // This is our public API:
  return {
    /**
     * Adds callback that is called when hash change happen. Callback receives
     * current hash string with `#?` sign
     * 
     * @param {Function} changeCallback - a function that is called when hash is
     * changed. Callback gets one argument that represents the new state.
     */
    onChanged: onChanged,

    /**
     * Releases all resources
     */
    dispose: dispose,

    /**
     * Sets a new app state
     *
     * @param {object} appState - the new application state, that should be
     * persisted in the hash string
     */
    set: set,

    /**
     * Gets current app state
     */
    get: getStateFromHash
  };

  // Public API is over. You can ignore this part.

  function init() {
    var stateFromHash = getStateFromHash();
    var stateChanged = false;

    if (typeof defaults === 'object' && defaults) {
      Object.keys(defaults).forEach(function(key) {
        if (key in stateFromHash) return;

        stateFromHash[key] = defaults[key]
        stateChanged = true;
      });
    }

    if (stateChanged) set(stateFromHash);
  }

  function set(appState) {
    var hash = hashPrefix + query.stringify(appState);

    if (window.history) {
      window.history.replaceState(undefined, undefined, hash);
    } else {
      window.location.replace(hash);
    }
  }

  function onChanged(changeCallback) {
    if (typeof changeCallback !== 'function') throw new Error('changeCallback needs to be a function');

    // we start listen just once, only if we didn't listen before:
    if (listeners.length === 0) {
      window.addEventListener('hashchange', onHashChanged, false);
    }

    listeners.push(changeCallback);
  }

  function dispose() {
    if (listeners.length === 0) return; // no need to do anything.

    // Let garbage collector collect all listeners;
    listeners = [];

    // And release hash change event:
    window.removeEventListener('hashchange', onHashChanged, false);
  }

  function onHashChanged() {
    var appState = getStateFromHash();
    notifyListeners(appState);
  }

  function notifyListeners(appState) {
    for (var i = 0; i < listeners.length; ++i) {
      var listener = listeners[i];
      listener(appState);
    }
  }

  function getStateFromHash() {
    var queryString = (window.location.hash || hashPrefix).substr(hashPrefix.length);

    return query.parse(queryString);
  }
}

},{"./nullHistory.js":2,"./query.js":3}],5:[function(require,module,exports){
module.exports = function(subject) {
  validateSubject(subject);

  var eventsStorage = createEventsStorage(subject);
  subject.on = eventsStorage.on;
  subject.off = eventsStorage.off;
  subject.fire = eventsStorage.fire;
  return subject;
};

function createEventsStorage(subject) {
  // Store all event listeners to this hash. Key is event name, value is array
  // of callback records.
  //
  // A callback record consists of callback function and its optional context:
  // { 'eventName' => [{callback: function, ctx: object}] }
  var registeredEvents = Object.create(null);

  return {
    on: function (eventName, callback, ctx) {
      if (typeof callback !== 'function') {
        throw new Error('callback is expected to be a function');
      }
      var handlers = registeredEvents[eventName];
      if (!handlers) {
        handlers = registeredEvents[eventName] = [];
      }
      handlers.push({callback: callback, ctx: ctx});

      return subject;
    },

    off: function (eventName, callback) {
      var wantToRemoveAll = (typeof eventName === 'undefined');
      if (wantToRemoveAll) {
        // Killing old events storage should be enough in this case:
        registeredEvents = Object.create(null);
        return subject;
      }

      if (registeredEvents[eventName]) {
        var deleteAllCallbacksForEvent = (typeof callback !== 'function');
        if (deleteAllCallbacksForEvent) {
          delete registeredEvents[eventName];
        } else {
          var callbacks = registeredEvents[eventName];
          for (var i = 0; i < callbacks.length; ++i) {
            if (callbacks[i].callback === callback) {
              callbacks.splice(i, 1);
            }
          }
        }
      }

      return subject;
    },

    fire: function (eventName) {
      var callbacks = registeredEvents[eventName];
      if (!callbacks) {
        return subject;
      }

      var fireArguments;
      if (arguments.length > 1) {
        fireArguments = Array.prototype.splice.call(arguments, 1);
      }
      for(var i = 0; i < callbacks.length; ++i) {
        var callbackInfo = callbacks[i];
        callbackInfo.callback.apply(callbackInfo.ctx, fireArguments);
      }

      return subject;
    }
  };
}

function validateSubject(subject) {
  if (!subject) {
    throw new Error('Eventify cannot use falsy object as events subject');
  }
  var reservedWords = ['on', 'fire', 'off'];
  for (var i = 0; i < reservedWords.length; ++i) {
    if (subject.hasOwnProperty(reservedWords[i])) {
      throw new Error("Subject cannot be eventified, since it already has property '" + reservedWords[i] + "'");
    }
  }
}

},{}]},{},[1])(1)
});