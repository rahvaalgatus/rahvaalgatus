"use strict";

app.controller("GroupCtrl", [ "$scope", "$rootScope", "$state", "$log", "$timeout", "ngDialog", "sGroup", function($scope, $rootScope, $state, $log, $timeout, ngDialog, sGroup) {
    $scope.groups = [];
    $scope.init = function() {
        sGroup.list().then(function(res) {
            $scope.groups = res.data.data.rows;
        }, function(res) {
            $log.log("Group list failed", res);
        });
    };
    $scope.init();
    $scope.doShowGroupEditView = function(groupId) {
        return $state.params.groupId == groupId;
    };
    $rootScope.$on("groups.change", function(event, data) {
        $scope.init();
    });
} ]);