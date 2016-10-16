"use strict";

app.controller("GroupCreateFormCtrl", [ "$scope", "$rootScope", "$log", "$q", "ngDialog", "sGroup", "sTopic", "sTranslate", function($scope, $rootScope, $log, $q, ngDialog, sGroup, sTopic, sTranslate) {
    $scope.init = function() {
        $scope.form = {
            name: null
        };
        $scope.errors = null;
        $scope.showForm = false;
        $scope.topics = {
            rows: [],
            count: 0
        };
        $scope.users = {
            rows: [],
            count: 0
        };
    };
    $scope.init();
    $scope.doShowForm = function() {
        $scope.showForm = true;
    };
    $scope.doHideForm = function() {
        $scope.showForm = false;
        $scope.init();
    };
    $scope.submit = function() {
        var promisesToResolve = [];
        sGroup.create($scope.form.name).then(function(result) {
            $log.log("Group was created successfully", result);
            var group = result.data.data;
            // Add all the Users to the Group
            if ($scope.users.rows.length) {
                var members = [];
                for (var j in $scope.users.rows) {
                    var user = $scope.users.rows[j];
                    members.push({
                        userId: user.userId
                    });
                }
                if (members.length) {
                    promisesToResolve.push(sGroup.membersCreate(group.id, members));
                }
            }
            // Add all the Topics to the Group
            // FIXME: Create API POST /users/:username/groups/:groupId/topics
            for (var i in $scope.topics.rows) {
                var topic = $scope.topics.rows[i];
                promisesToResolve.push(sTopic.memberGroupsCreate(topic.id, {
                    groupId: group.id
                }));
            }
            $q.all(promisesToResolve).then(function() {
                $rootScope.$broadcast("groups.change", result.data.data);
                $scope.init();
            });
        }, function(result) {
            $log.log("Group creation failed", result);
            sTranslate.errorsToKeys(result, "GROUP");
            $scope.errors = result.data.errors;
            $scope.recalculateGridSize();
        });
    };
    $scope.doShowPermissionsAddDialog = function() {
        // Dialog uses $scope.group
        $scope.group = $scope.form;
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
} ]);
