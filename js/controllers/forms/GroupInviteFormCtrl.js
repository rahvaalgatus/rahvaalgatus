"use strict";

app.controller("GroupInviteFormCtrl", [ "$scope", "$rootScope", "$state", "$log", "$q", "sSearch", function($scope, $rootScope, $state, $log, $q, sSearch) {
    /**
     * Inherits $scope.users
     * Inherits $scope.group
     */
    $scope.searchString = null;
    $scope.searchResults = null;
    $scope.search = function(str) {
        if (str && str.length >= 2) {
            // TODO: pass search filter "Users only"
            sSearch.search(str).then(function(response) {
                $scope.searchResults = response.data.data;
                $scope.searchResults.users = response.data.data.users.rows;
            }, function(response) {
                $log.error("Search failed...", response);
            });
        } else {
            $scope.searchResults.users = [];
        }
    };
    $scope.selectMember = function(member) {
        if (member) {
            if (_.find($scope.users.rows, {
                userId: member.id
            })) {
                // Ignore duplicates
                return;
            }
            // TODO: Invite API takes "userId" instead of "id".. Have I done it wrong or is there a reason?
            var memberClone = angular.copy(member);
            memberClone.userId = member.id;
            delete memberClone.id;
            $scope.users.rows.push(memberClone);
            $scope.users.count = $scope.users.rows.length;
        } else {
            // Assume e-mail was entered.
            if (validator.isEmail($scope.searchString)) {
                // Ignore duplicates
                if (!_.find($scope.users.rows, {
                    userId: $scope.searchString
                })) {
                    $scope.users.rows.push({
                        //Inherited from GroupCreateFormCtrl
                        userId: $scope.searchString,
                        name: $scope.searchString
                    });
                    $scope.users.count = $scope.users.rows.length;
                }
            } else {
                $log.debug("Ignoring member, as it does not look like e-mail", $scope.searchString);
            }
        }
        $scope.searchString = null;
    };
    $scope.removeMember = function(index) {
        $scope.users.rows.splice(index, 1);
        $scope.users.count = $scope.users.rows.length;
    };
    $scope.isInvited = function() {
        return $scope.users.rows.length;
    };
} ]);