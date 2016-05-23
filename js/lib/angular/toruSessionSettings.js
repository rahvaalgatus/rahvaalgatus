'use strict';

/**
 * Simplification
 */

var toruSessionSettings = angular.module('toruSessionSettings', []);
toruSessionSettings.factory('toruSessionSettings', ['$kookies', '$log', function ($kookies, $log) {
    var STORAGE_KEY = 'sessionSettings';

    if (!$kookies.get(STORAGE_KEY)) {
        $kookies.set(STORAGE_KEY, angular.toJson({}));
    }

    return {
        get: function (value) {
            var cookie = $kookies.get(STORAGE_KEY);
            if (cookie) {
                try {
                    var o = angular.fromJson(cookie);
                    return o[value];
                } catch (e) {
                    $log.error('Could not parse string to JSON', cookie, e);
                }
            }
            return null;
        },
        set: function (key, value) {
            var cookie = $kookies.get(STORAGE_KEY);
            try {
                var o = angular.fromJson(cookie);
                o[key] = value;
                $kookies.set(STORAGE_KEY, angular.toJson(o));
            } catch (e) {
                $log.error('Could not parse string to JSON', cookie, e);
            }
        },
        clearAll: function () {
            $kookies.set(STORAGE_KEY, angular.toJson({}));
        }
    };
}]);
