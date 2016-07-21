"use strict";

app.controller("LoginFormCtrl", [ "$scope", "$rootScope", "$window", "$state", "$stateParams", "$log", "ngDialog", "sAuth", "sTranslate", function($scope, $rootScope, $window, $state, $stateParams, $log, ngDialog, sAuth, sTranslate) {
    var init = function() {
        $scope.form = {
            email: null,
            password: null
        };
    };
    init();
    $scope.errors = null;
    // Form field errors
    // Init email from state params (url params)
    // Problem is that $state.params on load is empty, but some point it gets updated async...
    var unwatchStateParams = $scope.$watch(function() {
        return $state.params;
    }, function() {
        if ($state.params.email) {
            $scope.form.email = $state.params.email;
            unwatchStateParams();
        }
    });
    $scope.submit = function() {
        var success = function(response) {
            if($scope.app.user.email ==null){
                $scope.app.finalizeOpen = true;
            }
            if ($state.params && $state.params.redirectSuccess) {
                // TODO: I guess checking the URL would be nice in the future..
                return $window.location.href = $state.params.redirectSuccess;
            } else {
                $state.go("home", null, {
                    reload: true
                });
                init();
            }
        };
        var error = function(response) {
            var status = response.data.status;
            switch (status.code) {
              case 40001:
                // Account does not exist
                //Not using $state.go('account.signup') cause $stateParams are exposed in the url and
                //I don't want password to be there. Found no secret way to pass data to new state.
                ngDialog.open({
                    template: "/templates/modals/signUp.html",
                    data: $scope.form,
                    scope: $scope
                });
                break;

              case 40002:
                // Account has not been verified
                $scope.app.showInfo("MSG_INFO_ACCOUNT_NOT_VERIFIED");
                break;

              default:
                sTranslate.errorsToKeys(response, "USER");
                $scope.errors = response.data.errors;
            }
        };
        sAuth.login($scope.form.email, $scope.form.password).then(success, error);
    };
    $scope.loginEstid = function() {
        ngDialog.closeAll();
        ngDialog.open({
            appendTo: ".log-pop",
            template: "/templates/modals/loginEstid.html",
            data: {
                topicId: $state.params.id,
                voteId: $state.params.voteId,
                options: [ "YES" ]
            }
        });
    };
    $scope.loginPartner = function(partnerId) {
        var url = "https://citizenos.com/api/auth/:partnerId".replace(":partnerId", partnerId);
        //if ($stateParams.redirectSuccess) {
        url += "?redirectSuccess=http://rahvaalgatus.ee/";
        //}
        $window.location.href = url;
    };
    $scope.doRecoverPassword = function() {
        ngDialog.open({
            template: "/templates/modals/passwordForgot.html",
            scope: $scope
        });
    };
} ]);
