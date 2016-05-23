/**
 * Toru Etherpad Lite iframe directive
 *
 * If Angulars JQuery wasn't so limited and .css also returned non-inline styles I could also check if iframes initial size was defined with CSS. @see {@link https://docs.angularjs.org/api/ng/function/angular.element#angular-s-jqlite}
 *
 * TO loose all scrolls, Etherpad Lite needs custom stylesheet where:
 * * #editorcontainer { overflow: hidden }
 * * #outerdocbody { overflow: hidden }
 *
 */
var toruSelect = angular.module('toruEtherpad', []);

toruSelect.directive('toruEtherpad', ['$window', '$log', function ($window, $log) {
    return {
        restrict: 'A',
        scope: {
            height: '@?',
            width: '@?'
        },
        link: function (scope, element, attrs) {
            var $ = angular.element;

            var minWidth;
            var minHeight;

            var valueNotPercent = function (value) {
                return (value + '').indexOf('%') < 0;
            };

            if (scope.width && valueNotPercent(scope.width)) {
                minWidth = parseFloat(scope.width);
            }

            if (scope.height && valueNotPercent(scope.height)) {
                minHeight = parseFloat(scope.height);
            }

            $($window).on('message onmessage', function (e) {
                var msg = e.originalEvent.data;
                if (msg.name === 'ep_resize') {
                    var width = msg.data.width;
                    var height = msg.data.height;

                    if (angular.isNumber(width) && width > minWidth) {
                        var newWidth = width + 'px';
                        if (newWidth !== element.css('width')) {
                            element.css('width', newWidth);
                        }
                    }

                    if (angular.isNumber(height) && height > minHeight) {
                        var newHeight = height + 'px';
                        if (newHeight !== element.css('height')) {
                            element.css('height', newHeight);
                        }
                    }
                }
            });

            var sendScrollMessage = _.debounce(function () {
                var targetWindow = element.get(0).contentWindow;
                targetWindow.postMessage({
                    name: 'ep_embed_floating_toolbar_scroll',
                    data: {
                        scroll: {
                            top: $($window).scrollTop(),
                            left: $($window).scrollLeft()
                        },
                        frameOffset: {top:element.offset().top - $('header').outerHeight(),left:element.offset().left}
                    }
                }, '*');
            }, 100);

            $($window).on('scroll', function (e) {
                sendScrollMessage();
            });

            scope.$on('$destroy', function () {
                // Don't leave handlers hanging...
                $($window).off('message onmessage scroll');
            });
        }
    }
}]);
