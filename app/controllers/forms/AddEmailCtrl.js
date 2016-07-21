"use strict";

app.controller("AddEmailCtrl", [ "$scope", "$rootScope", "$log", "ngDialog", "sAuth", "sUser", "sTranslate", function($scope, $rootScope, $log, ngDialog, sAuth, sUser, sTranslate) {
    $scope.form = {
        email: null,
    };
    $scope.userlang = $scope.app.language;
    angular.extend($scope.form, sAuth.user);
    $scope.errors = null;
    $scope.success = null;
    $scope.submit = function() {
        $scope.errors = null;
        $scope.success = null;
        var success = function(res) {
             $scope.app.finalizeOpen = false;
            $scope.success = res.status.message;
            $rootScope.$broadcast("user.change", null);
            $scope.app.user.email = $scope.form.email;
            ngDialog.closeAll();
        };
        var error = function(res) {
             $scope.app.finalizeOpen = false;
            $log.log("Update failed", res);
            sTranslate.errorsToKeys(res, "USER");
            $scope.errors = res.data.errors;
        };
        sUser.update(null, $scope.form.email).then(success, error);
    };
    $scope.closeFinalizeDialog = function(){
        $(".login, .log-pop").hide();
        ngDialog.closeAll();
        $scope.app.finalizeOpen = false;
        $scope.$apply();
    };
} ]);
