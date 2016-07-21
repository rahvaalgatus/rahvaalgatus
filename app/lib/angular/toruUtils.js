'use strict';

/**
 * Angular utils
 */

var utils = angular.module('toruUtils', []);

utils.directive('appendLineFeed', [function () {
        return {
            restrict: 'A',
            scope: {
                append: '@'
            },
            replace: false,
            link: function (scope, elem, attrs, ngModel) {
                $(elem).after('&#10;');
            }
        }
    }]
);

utils.filter('toruSafeHtml', ['$sce', function ($sce) {
    return function (text) {
        return $sce.trustAsHtml(String(text).replace(/<[^(br|h1|h2|h3|h4|h5|h6)>]+>/gim, ''));
    }
}
]);

utils.filter('emailToDisplayName', function () {
    return function emailToDisplayName(email) {
        if (!email || !email.indexOf('@') || email.indexOf('@') < 1) return null;

        var displayName = '';

        email.split('@')[0].split(/[\._-]/).forEach(function (val) {
            displayName += val.charAt(0).toUpperCase() + val.substr(1) + ' ';
        });

        return displayName.trim();
    }
});

utils.filter('htmlToPlaintext', function() {
    var stripHtml = (function () {
        var tmpEl = document.createElement("DIV");
        function strip(html) {
          if (!html) {
            return "";
          }
          tmpEl.innerHTML = html;
          return tmpEl.textContent || tmpEl.innerText || "";
        }
        return strip;
    }());
    return function(text) {
      return stripHtml(text);
    };
  });
