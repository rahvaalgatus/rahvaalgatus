"use strict";

app.controller("GroupTopicsViewCtrl", [ "$scope", "$rootScope", "$state", "$log", "sGroup", "sTopic", function($scope, $rootScope, $state, $log, sGroup, sTopic) {
    $scope.group = $scope.$parent.ngDialogData;
    $scope.topics = null;
    $scope.init = function() {
        sGroup.topicsList($scope.group.id).then(function(result) {
            $log.log("Successfully fetched Topic list for Group", result);
            $scope.topics = result.data.data;
        }, function(result) {
            $log.log("Failed to fetch Topic list for Group", result);
        });
    };
    $scope.init();
    $scope.delete = function(topicId) {
        sTopic.memberGroupsDelete(topicId, $scope.group.id).then(function(result) {
            $log.log("Successfully removed Topic from Group", result);
            $rootScope.$broadcast("groups.change", null);
            $scope.init();
        }, function(result) {
            $log.log("Failed to delete Group access to Topic", result);
        });
    };
} ]);