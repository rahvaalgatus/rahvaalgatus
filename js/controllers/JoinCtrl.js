"use strict";

app.controller("JoinCtrl", [ "$scope", "$rootScope", "$state", "$stateParams", "$location", "$filter", "$log", "sTopic", function($scope, $rootScope, $state, $stateParams, $location, $filter, $log, sTopic) {
    sTopic.join($stateParams.tokenJoin).then(function(res) {
        var topic = res.data.data;
        $state.go("topics.view", {
            id: topic.id
        });
    }, function(res) {
        $log.error("Failed to join Topic ", res);
        var status = res.data.status;
        if (status.code === 40100) {
            // Unauthorized
            // Redirect to login.
            $log.error("Failed to join", status.code, status.message);
            var currentUrl = $state.href($state.current.name, $stateParams);
            $state.go("account.login", {
                redirectSuccess: currentUrl
            });
        } else if (status.code === 40001) {
            // Matching token not found.
            $state.go("home").then(function() {
                $scope.app.showError($filter("translate")("MSG_ERROR_INVALID_JOIN_TOKEN"));
            });
        } else {
            $log.error("Failed to join Topic", res);
        }
    });
} ]);
