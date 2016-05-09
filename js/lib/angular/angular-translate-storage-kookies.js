/*!
 * angular-translate - v2.6.1 - 2015-03-01
 * http://github.com/angular-translate/angular-translate
 * Copyright (c) 2015 ; Licensed MIT
 */
angular.module('pascalprecht.translate')

.factory('translateKookieStorage', ['$kookies', function ($kookies) {

  var translateKookieStorage = {

    get: function (name) {
      return $kookies.get(name);
    },

    set: function (name, value) {
      $kookies.set(name, value, {
        path: '/',
        expires: 365 * 10
      });
    },

    put: function (name, value) {
      $kookies.set(name, value, {
        path: '/',
        expires: 365 * 10
      });
    }
  };

  return translateKookieStorage;
}]);
