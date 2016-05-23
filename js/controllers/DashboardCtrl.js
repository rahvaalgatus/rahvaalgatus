"use strict";

app.controller("DashboardCtrl", [ "$scope", "$rootScope", "$state", "$log", "ngDialog", "sTopic", "sAuth", "sTranslate", function($scope, $rootScope, $state, $log, ngDialog, sTopic, sAuth, sTranslate) {
    $scope.topicList = [];
    $scope.isTopicListLoading = true;
    $scope.loadTopicList = function() {
        sTopic.list().then(function(res) {
            $scope.topicList = res.data.data.rows;
            $scope.isTopicListLoading = false;
        }, function(res) {
            $log.log("List fetch failed", res);
            $scope.isTopicListLoading = false;
        });
    };
    $scope.tabs = [ "topics", "activities" ];
    $scope.activeTab = "topics";
    $scope.loadTopicList();
    $scope.$on("topic.members.change", function(event, data) {
        $scope.loadTopicList();
    });
    $scope.changeTab = function(tab) {
        $scope.activeTab = tab;
    };
    $scope.doShowTopicPermissionsDialog = function(topic, showUserTab) {
        ngDialog.open({
            template: "/templates/modals/topicPermissions.html",
            data: {
                topic: topic,
                showUserTab: showUserTab
            }
        });
    };
    // FIXME: Had no idea how to construct the object in template, inside ng-dialog-data attribute :(
    $scope.doShow = function(topic, showUserTab) {
        return {
            topic: topic,
            showUserTab: showUserTab
        };
    };
    // TODO: This logic is kinda duplicate in TopicCtrl
    $scope.setTopicStatusToFollowUp = function(topic) {
        ngDialog.openConfirm({
            template: "/templates/modals/topicConfirmFollowUp.html"
        }).then(function() {
            var newStatus = sTopic.STATUSES.followUp;
            sTopic.setStatus(topic, newStatus).then(function() {
                topic.status = newStatus;
            }, function(err) {
                $log.error("Failed to set Topic status", topic, err);
            });
        }, angular.noop);
    };
    // TODO: This logic is kinda duplicate in TopicCtrl
    $scope.doLeaveTopic = function(topic) {
        ngDialog.openConfirm({
            template: "/templates/modals/topicConfirmLeave.html"
        }).then(function() {
            sTopic.memberUserDelete(topic.id, sAuth.user.id).then(function() {
                _.remove($scope.topicList, function(t) {
                    return t.id === topic.id;
                });
            }, function(err) {
                $log.error("Failed to leave Topic", topic, err);
                sTranslate.errorsToKeys(err, "TOPIC");
                $scope.app.showError(err.data.status.message);
            });
        }, angular.noop);
    };
    // TODO: This logic is kinda duplicate in TopicCtrl
    $scope.canSendToFollowUp = function(topic) {
        return topic.vote && topic.vote.id && topic.permission.level == sTopic.LEVELS.admin && topic.status !== sTopic.STATUSES.followUp;
    };
} ]);
