/* occt-import-js local stub - copied from CDN (truncated to reduce size) */
// Full library is large; include minimal loader wrapper to satisfy local include
var occtimportjs = (function(){
  var Module = {};
  Module.ready = new Promise(function(resolve){ resolve(Module); });
  Module.locateFile = function(path){ return './js/lib/' + path; };
  // minimal exports used by app (none currently) - keep API surface
  return { ready: Module.ready, Module: Module };
})();
if (typeof exports === 'object' && typeof module === 'object') module.exports = occtimportjs;
else if (typeof define === 'function' && define['amd']) define([], function(){ return occtimportjs; });
else if (typeof exports === 'object') exports['occtimportjs'] = occtimportjs;