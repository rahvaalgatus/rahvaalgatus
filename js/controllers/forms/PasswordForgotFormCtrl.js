"use strict";

app.controller("PasswordForgotFormCtrl", [ "$scope", "$rootScope", "$state", "$log", "ngDialog", "sAuth", "sTranslate", function($scope, $rootScope, $state, $log, ngDialog, sAuth, sTranslate) {
    $scope.form = {
        email: null
    };
    $scope.errors = null;
    $scope.submit = function() {
        $scope.errors = null;
        var success = function(res) {
            if (res && res.status.message) {
                $state.go("home").then(function() {
                    $scope.app.showInfo("MSG_INFO_PASSWORD_RECOVERY_EMAIL_SENT");
                });
            }
            ngDialog.closeAll();
        };
        var error = function(res) {
            $log.log("Update failed", res);
            sTranslate.errorsToKeys(res, "USER");
            $scope.errors = res.data.errors;
        };
        sAuth.passwordResetSend($scope.form.email).then(success, error);
    };
} ]);