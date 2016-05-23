/**
 * TODO:
 * Should use style "isOpen" instead of setting "open" class so that custom classes could be used.
 * * There is other stuff I feel is not done "Angular" way:
 * ** Should use ng-model style instead of callback? I wonder why I decided to use callback while doing the language select
 * ** Click event target !=toruSelectItem
 * ** Triggering onSelect for each change in multi-select, I could trigger it when the select is closed with array of values.
 */
var toruSelect = angular.module('toruSelect', []);

toruSelect.directive('toruSelect', function () {
    return {
        restrict: 'AE', // Allow usage as A - attribute, E - element
        scope: { // Isolated scope
            onSelect: '&',
            isMultiSelect: '=?'
        },
        controller: ['$scope', function ($scope) {
            $scope.isMultiSelect = $scope.isMultiSelect || false;

            this.select = function (value) {
                $scope.onSelect({selected: value});
            };
        }],
        link: function (scope, element, attrs) {
            element.bind('click', function (e) {
                if (scope.isMultiSelect && $(e.target).attr('toru-select-item')) {
                    return;
                }
                element.toggleClass('open');
            });

            // Click outside the select aka "blur"
            var handlerBlur = function (e) {
                var target = $(e.target);
                if (!element.find(target).length) {
                    element.removeClass('open');
                }
            };

            var body = $('body');
            body.bind('click', handlerBlur);
            scope.$on('$destroy', function () {
                // Don't leave handlers hanging...
                body.unbind('click', handlerBlur);
            });
        }
    }
});

toruSelect.directive('toruSelectItem', function () {
    return {
        retrict: 'AE',
        require: '^toruSelect',
        scope: {
            toruSelectItem: '='
        },
        link: function (scope, element, attrs, controller) {
            element.bind('click', function (e) {
                scope.$apply(function () {
                    controller.select(scope.toruSelectItem);
                });
            });
        }
    }
});
