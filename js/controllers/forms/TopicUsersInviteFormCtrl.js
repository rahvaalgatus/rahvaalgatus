"use strict";

app.controller("TopicUsersInviteFormCtrl", [ "$scope", "$rootScope", "$state", "$window", "$log", "$q", "sSearch", "sTopic", "sGroup", "sTranslate", function($scope, $rootScope, $state, $window, $log, $q, sSearch, sTopic, sGroup, sTranslate) {
    $scope.init = function(topic) {
        if (topic === undefined) {
            if ($state.params.id) {
                sTopic.read({
                    id: $state.params.id
                }).then(function(res) {
                    topic = res.data.data;
                    $scope.topic = topic;
                });
            }
        } else {
            $scope.topic = topic;
        }
        $scope.invite = {
            users: [],
            groups: []
        };
        $scope.searchString = null;
        $scope.searchResults = {
            users: [],
            groups: [],
            all: []
        };
        $scope.topicList = {
            count: 0,
            rows: []
        };
    };
    $scope.search = function(str) {
        $scope.selectedMember = null;
        if (str && str.length >= 2) {
            sSearch.search(str).then(function(response) {
                $scope.searchResults = response.data.data;
                $scope.searchResults.users = response.data.data.users.rows;
                $scope.searchResults.groups = response.data.data.groups.rows;
                $scope.searchResults.all = $scope.searchResults.users.concat($scope.searchResults.groups);
            }, function(response) {
                $log.error("Search failed...", response);
            });
        } else {
            $scope.searchResults.users = [];
            $scope.searchResults.groups = [];
            $scope.searchResults.all = [];
        }
    };
    $scope.selectMemberComplete = function(member) {
        if (member) {
            if (_.find($scope.invite.users, {
                userId: member.id
            }) || _.find($scope.invite.groups, {
                groupId: member.id
            })) {
                // Ignore duplicates
                return;
            }
            if (_.find($scope.searchResults.users, {
                id: member.id
            })) {
                $scope.searchString = member.name;
                $scope.selectedMember = member;
            }
        } else {
            $scope.selectedMember = null;
        }
    };
    $scope.addCoAuthor = function() {
        $scope.selectMember($scope.selectedMember);
    };
    $scope.selectMember = function(member) {
        if (member) {
            if (_.find($scope.invite.users, {
                userId: member.id
            }) || _.find($scope.invite.groups, {
                groupId: member.id
            })) {
                // Ignore duplicates
                return;
            }
            if (_.find($scope.searchResults.users, {
                id: member.id
            })) {
                $scope.invite.users.push({
                    userId: member.id,
                    name: member.name,
                    imageUrl: member.imageUrl
                });
            } else if (_.find($scope.searchResults.groups, {
                id: member.id
            })) {
                $scope.invite.groups.push({
                    groupId: member.id,
                    name: member.name
                });
            } else {
                $log.error("Member did not belong to any of the search results. Ignoring.", member);
            }
        } else {
            // Assume e-mail was entered.
            if (validator.isEmail($scope.searchString)) {
                // Ignore duplicates
                if (!_.find($scope.invite.users, {
                    userId: $scope.searchString
                })) {
                    $scope.invite.users.push({
                        userId: $scope.searchString,
                        name: $scope.searchString
                    });
                }
            } else {
                $log.debug("Ignoring member, as it does not look like e-mail", $scope.searchString);
            }
        }
        $scope.searchString = null;
    };
    $scope.isInvited = function() {
        return $scope.invite.users.length || $scope.invite.groups.length;
    };
    $scope.submit = function() {
        var promisesToHandle = [];
        if ($scope.invite.users.length) {
            promisesToHandle.push(sTopic.memberUsersCreate($scope.topic.id, $scope.invite.users));
        }
        if (promisesToHandle.length) {
            $q.all(promisesToHandle).then(function() {
                $rootScope.$broadcast("topic.members.change", {
                    id: $scope.topic.id
                });
                $scope.init($scope.topic);
            }, function(err) {
                $log.error("Some invites have failed", err);
                $scope.init($scope.topic);
            });
        }
    };
    $scope.submitAddusers = function() {
        var promisesToHandle = [];
        if ($scope.invite.users.length) {
            promisesToHandle.push(sTopic.memberUsersCreate($scope.topic.id, $scope.invite.users));
        }
        if ($scope.invite.groups.length) {
            promisesToHandle.push(sTopic.memberGroupsCreate($scope.topic.id, $scope.invite.groups));
        }
        if (promisesToHandle.length) {
            $q.all(promisesToHandle).then(function() {
                $rootScope.$broadcast("topic.members.change", {
                    id: $scope.topic.id
                });
                $state.go("topics.view", {
                    id: $scope.topic.id
                }, {});
            }, function(err) {
                $log.error("Some invites have failed", err);
            });
        } else {
            $state.go("topics.view", {
                id: $scope.topic.id
            }, {});
        }
    };
    /* $scope.loadMembersList = function(){
        if ($state.params.id) {
                sTopic.membersList($state.params.id).then(function(res) {
                    $scope.invite.users = res.data.data.users.rows;
                });
        }
    }*/
    $scope.removeUser = function(index) {
        $scope.invite.users.splice(index, 1);
    };
    $scope.removeGroup = function(index) {
        $scope.invite.groups.splice(index, 1);
    };
    $scope.generateTokenJoin = function() {
        sTopic.setTokenJoin($scope.topic.id).then(function(res) {
            $log.debug("Token generated", res);
            $scope.topic.tokenJoin = res.data.data.tokenJoin;
            // TODO: Force refresh of dashboard Topic list. If I had reference to original Topic, I would not need it...
            $rootScope.$broadcast("topic.members.change", {
                id: $scope.topic.id
            });
        }, function(err) {
            $log.error("Token generation failed", err);
        });
    };
    $scope.updateTopicList = function(topic) {
        if ($scope.isTopicAdded(topic)) {
            var index = _.findIndex($scope.topics.rows, {
                id: topic.id
            });
            $scope.topics.rows.splice(index);
            $scope.topics.count = $scope.topics.rows.length;
            $log.log("updateTopicList - removed - ", topic);
        } else {
            $scope.topics.rows.push(topic);
            $scope.topics.count = $scope.topics.rows.length;
            $log.log("updateTopicList - added - ", topic);
        }
    };
    $scope.isTopicAdded = function(topic) {
        return _.findIndex($scope.topics.rows, {
            id: topic.id
        }) > -1;
    };
    $scope.$watch(function() {
        if ($scope.topic) return $scope.topic.tokenJoin;
        return false;
    }, function(newVal, oldVal) {
        $scope.urlJoin = $window.location.origin + "/rahvaalgatus/join/" + newVal;
    });
} ]);