/**
 * @see http://docs.angularjs.org/guide/concepts
 * @see http://fdietz.github.io/recipes-with-angular-js/common-user-interface-patterns/editing-text-in-place-using-html5-content-editable.html
 */

angular.module('contenteditable', [])
    .directive('contenteditable', ['$timeout', '$filter', function ($timeout, $filter) {
        return {
            restrict: "A",
            require: "ngModel",
            link: function (scope, element, attrs, ngModel) {

                function read() {
                    ngModel.$setViewValue(element.text());
                }

                ngModel.$render = function () {
                    element.html($filter('linky')(ngModel.$viewValue) || "");
                    $('a', element).attr('contenteditable', false);
                };

                element.bind("blur keyup change", function () {
                    scope.$apply(read);
                });

            }
        }
    }]);
