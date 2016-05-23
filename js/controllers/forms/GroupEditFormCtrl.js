"use strict";

app.controller("GroupEditFormCtrl", [ "$scope", "$rootScope", "$log", "$q", "ngDialog", "sGroup", "sTopic", "sTranslate", function($scope, $rootScope, $log, $q, ngDialog, sGroup, sTopic, sTranslate) {
    $scope.init = function(group, showForm) {
        $scope.group = group;
        $scope.form = {
            name: group.name
        };
        $scope.errors = null;
        $scope.showForm = showForm || false;
        $scope.topics = {
            rows: [],
            count: 0
        };
        $scope.users = {
            rows: [],
            count: 0
        };
    };
    $scope.doShowForm = function() {
        $scope.showForm = true;
    };
    $scope.doHideForm = function() {
        $scope.init($scope.group, false);
    };
    $scope.isAdmin = function() {
        return $scope.group.permission.level == sGroup.LEVELS.admin;
    };
    $scope.doShowPermissionsAddDialog = function() {
        ngDialog.open({
            template: "/templates/modals/groupPermissionsAdd.html",
            scope: $scope
        });
    };
    $scope.doShowTopicsAddDialog = function() {
        ngDialog.open({
            template: "/templates/modals/groupTopicsAdd.html",
            scope: $scope
        });
    };
    $scope.submit = function() {
        var promisesToResolve = [];
        promisesToResolve.push(sGroup.update($scope.group.id, $scope.form.name));
        // Add all the Users to the Group
        if ($scope.users.rows.length) {
            // Add all the Users to the Group
            var members = [];
            for (var j in $scope.users.rows) {
                var user = $scope.users.rows[j];
                members.push({
                    userId: user.userId
                });
            }
            if (members.length) {
                promisesToResolve.push(sGroup.membersCreate($scope.group.id, members));
            }
        }
        // Add all the Topics to the Group
        // FIXME: Create API POST /users/:username/groups/:groupId/topics
        for (var i in $scope.topics.rows) {
            var topic = $scope.topics.rows[i];
            promisesToResolve.push(sTopic.memberGroupsCreate(topic.id, {
                groupId: $scope.group.id
            }));
        }
        $q.all(promisesToResolve).then(function(result) {
            $log.log("Group was updated successfully", result);
            $rootScope.$broadcast("groups.change", $scope.group);
            $scope.showForm = false;
        }, function(result) {
            sTranslate.errorsToKeys(result, "GROUP");
            $scope.errors = result.data.errors;
            $scope.recalculateGridSize();
        });
    };
    $scope.delete = function() {
        ngDialog.openConfirm({
            template: "/templates/modals/groupConfirmDelete.html"
        }).then(function() {
            sGroup.delete($scope.group.id).then(function(result) {
                $log.log("Group was deleted successfully", result);
                $rootScope.$broadcast("groups.change", null);
            }, function(result) {
                $log.log("Group deletion failed", result);
            });
        }, angular.noop);
    };
} ]);
