"use strict";

app.controller("LoginEstidCtrl", [ "$scope", "$state", "$log", "$q", "$timeout", "hwcrypto", "ngDialog", "sTranslate", "sAuth", function($scope, $state, $log, $q, $timeout, hwcrypto, ngDialog, sTranslate, sAuth) {
    $log.debug("LoginEstidCtrl", $scope.ngDialogData);
    $scope.formMobile = {
        pid: null,
        phoneNumber: '+372',
        challengeID: null,
        isLoading: false
    };
    $scope.estidLoginError = null;
    $scope.doCloseEstidLoginError = function() {
        $scope.estidLoginError = null;
    };
    $scope.doLoginWithCard = function () {
        $log.debug('doLoginWithCard()');
        $scope.isLoadingIdCard = true;
        $scope.estidLoginError = null;

        sAuth
            .loginId()
            .then(function (loginStatusResult) {
                $log.debug('Login ID result', loginStatusResult);
                if(sAuth.user.email ==null){
                    $scope.app.finalizeOpen = true;
                }
                ngDialog.closeAll(true);
            }, function (err) {
                $log.error('Something failed when trying to log in with card', err);

                if (!err.data) {
                    $log.error('Error when logging in with card', err);
                    msg = 'MSG_ERROR_50000';
                } else {
                    sTranslate.errorsToKeys(err, 'LOGIN');
                    msg = err.data.status.message;
                }

                $scope.isLoadingIdCard = false;
                $scope.estidLoginError = msg;
            });
    };
    $scope.doLoginWithMobile = function() {
        $log.debug("doSignWithMobile()");
        $scope.formMobile.isLoading = true;
        $scope.estidLoginError = null;
        sAuth.loginMobileInit($scope.formMobile.pid, $scope.formMobile.phoneNumber).then(function(loginMobileIdInitResult) {
            $log.debug("loginMobileIdInit", loginMobileIdInitResult);
            $scope.formMobile.challengeID = loginMobileIdInitResult.challengeID;
            var token = loginMobileIdInitResult.token;
            return pollMobileLoginStatus(token, 3000, 80);
        }).then(function(loginStatusResult) {
            if(sAuth.user.email ==null){
                    $scope.app.finalizeOpen = true;
                }
            $log.debug("Login status result", loginStatusResult);
            ngDialog.closeAll(true);
        }, function(err) {
            $log.error("Something failed when trying to log in with mobile", err);
            if (!err.data) {
                $log.error("Error when signing with mobile id", err);
                msg = "MSG_ERROR_50000";
            } else {
                sTranslate.errorsToKeys(err, "LOGIN");
                msg = err.data.status.message;
            }
            $scope.formMobile.isLoading = false;
            $scope.formMobile.challengeID = null;
            $scope.estidLoginError = msg;
        });
    };
    var pollMobileLoginStatus = function(token, milliseconds, retry) {
        if (!retry) retry = 80;
        if (!retry--) throw new Error("Too many retries");
        return $timeout(function() {
            return sAuth.loginMobileStatus(token).then(function(response) {
                var statusCode = response.data.status.code;
                switch (statusCode) {
                  case 20001:
                    return $timeout(function() {
                        return pollMobileLoginStatus(token, milliseconds, retry);
                    }, milliseconds, false);

                  case 20002:
                    // Existing User logged in
                    return;

                  case 20003:
                    // New User was created and logged in
                    return;

                  default:
                    $log.error("Mobile login failed", response);
                    return $q.defer().reject(response);
                }
            });
        }, milliseconds, false);
    };
} ]);
