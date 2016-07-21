"use strict";

app.controller("PasswordResetFormCtrl", [ "$scope", "$rootScope", "$state", "$stateParams", "$log", "ngDialog", "sAuth", "sTranslate", function($scope, $rootScope, $state, $stateParams, $log, ngDialog, sAuth, sTranslate) {
    $scope.form = {
        password: null,
        passwordRepeat: null
    };
    $scope.passwordResetEmail = $stateParams.email;
    $scope.errors = null;
    $scope.submit = function() {
        $scope.errors = null;
        if ($scope.form.passwordRepeat !== $scope.form.password) {
            $scope.errors = {
                passwordRepeat: "MSG_ERROR_PASSWORD_NO_MATCH"
            };
            return;
        }
        var success = function(res) {
            $state.go("account.login", {
                email: $scope.passwordResetEmail
            }).then(function() {
                $scope.app.showInfo("MSG_INFO_PASSWORD_RESET_SUCCESS");
            });
            ngDialog.closeAll();
        };
        var error = function(res) {
            $log.log("Update failed", res);
            sTranslate.errorsToKeys(res, "USER");
            $scope.errors = res.data.errors;
        };
        sAuth.passwordReset($stateParams.email, $scope.form.password, $stateParams.passwordResetCode).then(success, error);
    };
} ]);
