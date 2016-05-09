"use strict";

app.controller("TopicCommentCreateFormCtrl", [ "$scope", "$rootScope", "$state", "$log", "$q", "sTopic", function($scope, $rootScope, $state, $log, $q, sTopic) {
    var init = function() {
        $scope.form = {
            type: null,
            subject: null,
            text: null
        };
        $scope.maxLengthSubject = 128;
        $scope.maxLengthText = 2048;
        $scope.charactersLeft = $scope.maxLength;
    };
    $scope.selectedMember = null;
    init();
    $scope.$watch(function() {
        return $scope.form.text;
    }, function() {
        $scope.charactersLeft = $scope.maxLengthText - ($scope.form.text ? $scope.form.text.length : 0);
    });
    var saveComment = function(parentId, type) {
        sTopic.commentCreate($scope.topic.id, parentId, type, $scope.form.subject, $scope.form.text).then(function(res) {
            $log.debug("Topic comment created!", res.data.data);
            $scope.loadComments();
            // TODO: calls parent TopicCtrl, may want to use events instead?
            init();
        }, function(res) {
            $log.error("Topic comment creation failed!", res);
        });
    };
    $scope.submitPro = function() {
        saveComment(null, sTopic.COMMENT_TYPES.pro);
    };
    $scope.submitCon = function() {
        saveComment(null, sTopic.COMMENT_TYPES.con);
    };
    $scope.submitReply = function(parentId) {
        $scope.form.subject = null;
        saveComment(parentId, $scope.form.type);
    };
} ]);