"use strict";

app.controller("TopicPermissionsCtrl", [ "$scope", "$state", "$log", "sTopic", function($scope, $state, $log, sTopic) {
    $scope.topic = $scope.$parent.ngDialogData.topic;
    $scope.showUserTab = $scope.$parent.ngDialogData.showUserTab;
    $scope.LEVELS = _.values(sTopic.LEVELS);
    $scope.topicGroups = [];
    $scope.topicUsers = [];
    $scope.init = function() {
        sTopic.membersList($scope.topic.id).then(function(res) {
            $scope.topicGroups = res.data.data.groups;
            $scope.topicUsers = res.data.data.users;
            $log.log("Topic users", $scope.topicUsers);
        }, function(res) {
            $log.log("Member list retrieval failed", res);
        });
    };
    $scope.init();
    /**
     * Set User level
     *
     * @param {object} user User user in $scope.topicUsers
     * @param {string} level New level
     */
    $scope.setUserLevel = function(user, level) {
        if (!user || user.level === level) return;
        sTopic.memberUserUpdate($scope.topic.id, user.id, level).then(function(res) {
            // Update model if the change succeeded.
            _.find($scope.topicUsers.rows, {
                id: user.id
            }).level = level;
        }, angular.noop);
    };
    /**
     * Set Group level
     *
     * @param {object} group Group in $scope.topicGroups
     * @param {string} level New level
     */
    $scope.setGroupLevel = function(group, level) {
        if (!group || group.level === level) return;
        sTopic.memberGroupsUpdate($scope.topic.id, group.id, level).then(function(res) {
            // Update model if the change succeeded.
            _.find($scope.topicGroups.rows, {
                id: group.id
            }).level = level;
        }, angular.noop);
    };
    $scope.isAdmin = function() {
        return $scope.topic.permission.level == sTopic.LEVELS.admin;
    };
    $scope.doShowUserTab = function() {
        if (!$scope.showUserTab) {
            $scope.init();
            // IF Group permissions changed, need to reload so that User view gets updated
            $scope.showUserTab = true;
        }
    };
    $scope.doShowGroupTab = function() {
        $scope.showUserTab = false;
    };
    $scope.deleteMemberUser = function(userId) {
        sTopic.memberUserDelete($scope.topic.id, userId).then(function(res) {
            $log.log("Member user delete success!", $scope.topic.id, userId);
            $scope.init();
        }, function(res) {
            $log.error("Topic member user deletion failed!", res, $scope.topic, userId);
        });
    };
    $scope.deleteMemberGroup = function(groupId) {
        sTopic.memberGroupsDelete($scope.topic.id, groupId).then(function(res) {
            $log.log("Member group delete success!", $scope.topic.id, groupId);
            $scope.init();
        }, function(res) {
            $log.error("Topic member user deletion failed!", res, $scope.topic, groupId);
        });
    };
} ]);
