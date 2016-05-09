"use strict";

app.controller("GroupTopicsAddCtrl", [ "$scope", "$rootScope", "$state", "$log", "$q", "sGroup", "sTopic", function($scope, $rootScope, $state, $log, $q, sGroup, sTopic) {
    /**
     * Inherits
     *  $scope.group
     *  $scope.topics - Topics to be added to Group
     */
    // List shown in the UI
    $scope.topicList = {
        count: 0,
        rows: []
    };
    $scope.init = function() {
        var promisesToResolve = [];
        // List of Topics User is a member
        promisesToResolve.push(sTopic.list());
        // TODO: would be nice if BE would do it in one query
        // List of Topics that Group has access to
        if ($scope.group && $scope.group.id) {
            promisesToResolve.push(sGroup.topicsList($scope.group.id));
        }
        $q.all(promisesToResolve).then(function(results) {
            var topics = [];
            var userTopicsList = results[0].data.data.rows;
            if (results[1]) {
                var groupTopicList = results[1].data.data.rows;
                // Filter the Topics already in the Group
                topics = _.filter(userTopicsList, function(userTopic) {
                    return !_.find(groupTopicList, {
                        id: userTopic.id
                    });
                });
            } else {
                topics = userTopicsList;
            }
            $scope.topicList = {
                count: topics.length,
                rows: topics
            };
            $log.info($scope.topicList);
        }, function(err) {
            $log.error("Failed to fetch Topic list", err);
        });
    };
    $scope.init();
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
} ]);