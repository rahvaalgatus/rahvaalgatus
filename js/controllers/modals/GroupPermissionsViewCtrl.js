"use strict";

app.controller("GroupPermissionsViewCtrl", [ "$scope", "$state", "$log", "sGroup", function($scope, $state, $log, sGroup) {
    $scope.group = $scope.$parent.ngDialogData;
    $scope.LEVELS = _.values(sGroup.LEVELS);
    $scope.members = {
        count: 0,
        rows: []
    };
    $scope.init = function() {
        sGroup.membersList($scope.group.id).then(function(results) {
            $scope.members = results.data.data;
        }, function(result) {
            $log.log("Failed to retrieve Member list", result);
        });
    };
    $scope.init();
    $scope.isAdmin = function() {
        return $scope.group.permission.level == sGroup.LEVELS.admin;
    };
    $scope.delete = function(index) {
        var member = $scope.members.rows[index];
        sGroup.memberDelete($scope.group.id, member.id).then(function(results) {
            $scope.members.rows.splice(index, 1);
            $scope.members.count = $scope.members.rows.length;
        }, function(results) {
            $log.log("Deletion failed", results);
        });
    };
    $scope.setGroupUserLevel = function(user, level) {
        if (!user || user.level === level) return;
        sGroup.memberUpdate($scope.group.id, user.id, level).then(function(res) {
            // Update model if the change succeeded.
            _.find($scope.members.rows, {
                id: user.id
            }).level = level;
        }, angular.noop);
    };
} ]);
