"use strict";

app.controller("TopicSettingsFormCtrl", [ "$scope", "$rootScope", "$state", "$log", "$q", "ngDialog", "sTopic", function($scope, $rootScope, $state, $log, $q, ngDialog, sTopic) {
    $scope.showSettings = false;
    $scope.topicVisibilityOptions = _.values(sTopic.VISIBILITY);
    /*$scope.init = function(topic) {
        $scope.topic = topic;
        $scope.getCurrentTopicComments(topic.id);
    };*/
    /*$scope.getCurrentTopicComments = function(id){
        var success = function(res){
            $scope.topic.comments = res.data.data;
        };
        var error = function(err, res) {
            $log.error("Topic comments load failed", err, res);
        };
        if ($scope.app.user && $scope.app.user.loggedIn) {
            sTopic.commentList(id).then(success, error);
        } else {
            sTopic.commentListUnauth(id).then(success, error);
        }
    };*/
    $scope.doDelete = function() {
        ngDialog.openConfirm({
            template: "/templates/modals/topicConfirmDelete.html"
        }).then(function() {
            sTopic.delete($scope.topic.id).then(function(result) {
                $log.log("Topic was deleted successfully", result);
                $scope.loadTopicList();
            }, function(result) {
                $log.log("Topic deletion failed", result);
            });
        }, angular.noop);
    };
    $scope.doSetVisibility = function(visibility) {
        if (!visibility || $scope.topic.visibility === visibility) return;
        sTopic.update({
            id: $scope.topic.id,
            visibility: visibility
        }).then(function(result) {
            $log.debug("Topic visibility update succeeded", result);
            $scope.topic.visibility = visibility;
        }, function(result) {
            $log.error("Topic visibility update failed", result);
        });
    };
    $scope.isAdmin = function() {
        return $scope.topic.permission.level == sTopic.LEVELS.admin;
    };
} ]);
