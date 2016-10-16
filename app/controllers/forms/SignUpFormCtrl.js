"use strict";

app.controller("SignUpFormCtrl", [ "$scope", "$rootScope", "$state", "$stateParams", "$filter", "$log", "ngDialog", "sAuth", "sTranslate", function($scope, $rootScope, $state, $stateParams, $filter, $log, ngDialog, sAuth, sTranslate) {
    $scope.form = {
        name: null,
        email: null,
        password: null,
        passwordRepeat: null,
        company: null,
        redirectSuccess: null
    };
    $scope.errors = null;
    console.log("form", $scope.form, "stateParams", $stateParams, "ngDialogData", $scope.$parent.ngDialogData);
    angular.extend($scope.form, $stateParams, $scope.$parent.ngDialogData);
    $scope.form.name = $scope.form.name || $filter("emailToDisplayName")($scope.form.email);
    $scope.submit = function() {
        $scope.errors = null;
        if ($scope.form.passwordRepeat !== $scope.form.password) {
            $scope.errors = {
                passwordRepeat: "MSG_ERROR_PASSWORD_NO_MATCH"
            };
            return;
        }
        var success = function(response) {
            $scope.app.showInfo("MSG_INFO_CHECK_EMAIL_TO_VERIFY_YOUR_ACCOUNT");
            ngDialog.closeAll();
        };
        var error = function(response) {
            sTranslate.errorsToKeys(response, "USER");
            $scope.errors = response.data.errors;
        };
        sAuth.signUp($scope.form.email, $scope.form.password, $scope.form.name, $scope.form.company, decodeURIComponent($scope.form.redirectSuccess)).then(success, error);
    };
} ]);
