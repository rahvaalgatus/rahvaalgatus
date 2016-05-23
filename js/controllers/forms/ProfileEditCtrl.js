"use strict";

app.controller("ProfileEditCtrl", [ "$scope", "$rootScope", "$log", "ngDialog", "sAuth", "sUser", "sTranslate", function($scope, $rootScope, $log, ngDialog, sAuth, sUser, sTranslate) {
    $scope.form = {
        name: null,
        email: null,
        password: null,
        passwordRepeat: null,
        company: null,
        imageUrl: null
    };
    $scope.userlang = $scope.app.language;
    angular.extend($scope.form, sAuth.user);
    $scope.errors = null;
    $scope.success = null;
    $scope.submit = function() {
        $scope.errors = null;
        $scope.success = null;
        if ($scope.form.passwordRepeat !== $scope.form.password) {
            $scope.errors = {
                passwordRepeat: "MSG_ERROR_PASSWORD_NO_MATCH"
            };
            return;
        }
        var success = function(res) {
            $scope.success = res.status.message;
            $rootScope.$broadcast("user.change", null);
            ngDialog.closeAll();
        };
        var error = function(res) {
            $log.log("Update failed", res);
            sTranslate.errorsToKeys(res, "USER");
            $scope.errors = res.data.errors;
        };
        sUser.update($scope.form.name, $scope.form.email, $scope.form.password, $scope.form.company).then(success, error);
    };
} ]);
