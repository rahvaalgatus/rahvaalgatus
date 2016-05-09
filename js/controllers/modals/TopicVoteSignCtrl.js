"use strict";

app.controller("TopicVoteSignCtrl", [ "$scope", "$state", "$log", "$q", "$timeout", "hwcrypto", "ngDialog", "sTranslate", "sTopic", "sAuth", function($scope, $state, $log, $q, $timeout, hwcrypto, ngDialog, sTranslate, sTopic, sAuth) {
    $log.debug("TopicVoteSignCtrl", $scope.ngDialogData);
    var topicId = $scope.ngDialogData.topicId;
    var voteId = $scope.ngDialogData.voteId;
    var options = $scope.ngDialogData.options;
    var bdocUri = "";
    $scope.showdonate = false;
    $scope.showVoteRevokedResult = false;
    $scope.formMobile = {
        pid: null,
        phoneNumber: "+372 ",
        challengeID: null,
        isLoading: false
    };
    $scope.skipDonate = function() {
        ngDialog.closeAll({
            // Pass Vote options, so we can show selected option for the unauthenticated User
            options: options,
            bdocUri: bdocUri
        });
    };
    $scope.showDonate = function() {
        $scope.showdonate = true;
        $scope.$apply();
    };
    // TODO: Multiple choice support some day...
    $scope.optionSelected = options[0];
    $scope.voteSignError = null;
    $scope.doCloseVoteSignError = function() {
        $scope.voteSignError = null;
    };
    $scope.doSignWithCard = function() {
        $log.debug("doSign()", hwcrypto);
        $scope.voteSignError = null;
        $scope.isLoadingIdCard = true;
        hwcrypto.getCertificate({}).then(function(certificate) {
            $log.debug("Certificate", certificate);
            $scope.voteSignError = null;
            var votePromise;
            if ($scope.optionSelected.value == "No") {
                $scope.showVoteRevokedResult = true;
            }
            if (sAuth.user.loggedIn) {
                votePromise = sTopic.voteVote(topicId, voteId, [ {
                    optionId: $scope.optionSelected.id
                } ], certificate.hex);
            } else {
                votePromise = sTopic.voteVoteUnauth(topicId, voteId, [ {
                    optionId: $scope.optionSelected.id
                } ], certificate.hex);
            }
            return $q.all([ certificate, votePromise ]);
        }).then(function(results) {
            $log.debug("After Vote", arguments);
            var certificate = results[0];
            var voteResponse = results[1];
            var signedInfoDigest = voteResponse.data.data.signedInfoDigest;
            var signedInfoHashType = voteResponse.data.data.signedInfoHashType;
            var token = voteResponse.data.data.token;
            return $q.all([ hwcrypto.sign(certificate, {
                hex: signedInfoDigest,
                type: signedInfoHashType
            }, {}), token ]);
        }).then(function(results) {
            var signature = results[0];
            var token = results[1];
            if (sAuth.user.loggedIn) {
                return sTopic.voteVoteSign(topicId, voteId, signature.hex, token);
            } else {
                return sTopic.voteVoteSignUnauth(topicId, voteId, signature.hex, token);
            }
        }).then(function(voteSignResult) {
            $scope.isLoadingIdCard = false;
            bdocUri = voteSignResult.data.data.bdocUri;
            $scope.showDonate();
            $log.debug("voteVoteSign succeeded", arguments);
            $scope.$apply();
        }, function(err) {
            $scope.isLoadingIdCard = false;
            var msg = null;
            if (err instanceof Error) {
                //hwcrypto and JS errors
                msg = hwCryptoErrorToTranslationKey(err);
            } else {
                // API error response
                sTranslate.errorsToKeys(err, "VOTE");
                msg = err.data.status.message;
            }
            $scope.$apply(function() {
                $scope.voteSignError = msg;
            });
        });
    };
    $scope.doSignWithMobile = function() {
        $log.debug("doSignWithMobile()");
        $scope.formMobile.isLoading = true;
        $scope.voteSignError = null;
        var votePromise;
        if ($scope.optionSelected.value == "No") {
            $scope.showVoteRevokedResult = true;
        }
        if (sAuth.user.loggedIn) {
            votePromise = sTopic.voteVote(topicId, voteId, [ {
                optionId: $scope.optionSelected.id
            } ], null, $scope.formMobile.pid, $scope.formMobile.phoneNumber);
        } else {
            votePromise = sTopic.voteVoteUnauth(topicId, voteId, [ {
                optionId: $scope.optionSelected.id
            } ], null, $scope.formMobile.pid, $scope.formMobile.phoneNumber);
        }
        votePromise.then(function(voteInitResult) {
            $log.debug("voteInitResult", voteInitResult);
            $scope.formMobile.challengeID = voteInitResult.data.data.challengeID;
            var token = voteInitResult.data.data.token;
            return pollVoteMobileSignStatus(topicId, voteId, token, 3e3, 80);
        }).then(function(voteStatusResult) {
            bdocUri = voteStatusResult.data.data.bdocUri;
            $scope.showDonate();
            $log.debug("voteStatusResult", voteStatusResult);
        }, function(err) {
            $log.error("Something failed when trying to sign with mobile", err);
            if (!err.data) {
                $log.error("Error when signing with mobile id", err);
                msg = "MSG_ERROR_50000";
            } else {
                sTranslate.errorsToKeys(err, "VOTE");
                msg = err.data.status.message;
            }
            $scope.formMobile.isLoading = false;
            $scope.formMobile.challengeID = null;
            $scope.voteSignError = msg;
        });
    };
    var pollVoteMobileSignStatus = function(topicId, voteId, token, milliseconds, retry) {
        if (!retry) retry = 80;
        if (!retry--) throw new Error("Too many retries");
        var voteStatusPromise;
        if (sAuth.user.loggedIn) {
            voteStatusPromise = sTopic.voteVoteStatus(topicId, voteId, token);
        } else {
            voteStatusPromise = sTopic.voteVoteStatusUnauth(topicId, voteId, token);
        }
        return voteStatusPromise.then(function(response) {
            var statusCode = response.data.status.code;
            switch (statusCode) {
              case 20001:
                return $timeout(function() {
                    return pollVoteMobileSignStatus(topicId, voteId, token, milliseconds, retry);
                }, milliseconds, false);

              case 20002:
                // Done
                return response;

              default:
                $log.error("Mobile signing failed", response);
                return $q.defer().reject(response);
            }
        });
    };
    var hwCryptoErrorToTranslationKey = function(err) {
        var errorKeyPrefix = "MSG_ERROR_HWCRYPTO_";
        switch (err.message) {
          case hwcrypto.NO_CERTIFICATES:
          case hwcrypto.USER_CANCEL:
          case hwcrypto.NO_IMPLEMENTATION:
            return errorKeyPrefix + err.message.toUpperCase();
            break;

          case hwcrypto.INVALID_ARGUMENT:
          case hwcrypto.NOT_ALLOWED:
          case hwcrypto.TECHNICAL_ERROR:
            $log.error(err.message, "Technical error from HWCrypto library", err);
            return errorKeyPrefix + "TECHNICAL_ERROR";
            break;

          default:
            $log.error(err.message, "Unknown error from HWCrypto library", err);
            return errorKeyPrefix + "TECHNICAL_ERROR";
        }
    };
} ]);