"use strict";

app.controller("TopicRenewDeadlineFormCtrl", [ "$scope", "$rootScope", "$state", "$log", "$q", "moment", "sTopic", function($scope, $rootScope, $state, $log, $q, moment, sTopic) {
    $scope.endsAt = null;
    var CONF = {
        defaultOptions: {
            regular: [ {
                value: "Yes"
            }, {
                value: "No"
            } ],
            multiple: [ {
                value: null
            }, {
                value: null
            } ]
        },
        extraOptions: {
            neutral: {
                value: "Neutral",
                enabled: false
            },
            // enabled - is the option enabled by default
            veto: {
                value: "Veto",
                enabled: false
            }
        },
        optionsMax: 10,
        optionsMin: 2
    };
    $scope.voteTypes = sTopic.VOTE_TYPES;
    $scope.voteAuthTypes = sTopic.VOTE_AUTH_TYPES;
    $scope.form = {
        endsAt: new Date(),
        showCalendar: true,
        voteType: $scope.voteTypes.regular,
        authType: $scope.voteAuthTypes.hard,
        numberOfDaysLeft: 0
    };
    $scope.$watch("form.endsAt", function(newValue, oldValue) {
        if (!newValue) return;
        newValue = new Date(newValue);
        var diffTime = newValue.getTime() - new Date().getTime();
        $scope.form.numberOfDaysLeft = Math.ceil(diffTime / (1e3 * 3600 * 24));
    });
    $scope.save = function() {
        if (!$scope.form.showCalendar) {
            // There must be a more elegant solution..
            $scope.form.endsAt = null;
        }
        // Ends at midnight of the date chosen, thus 00:00:00 of the next day.
        var endsAt = moment($scope.form.endsAt).toDate();
        endsAt = new Date(endsAt);
        endsAt.setHours(23,59,59);
        console.log(endsAt);
        if($scope.topic.status == 'voting'){
            console.log('UPDATE VOTING')
             sTopic.voteUpdate($scope.topic.id,$scope.vote.id, endsAt).then(function(res){
                $state.go("topics.view", {
                    id: $state.params.id
                });
            });
        }
        else if($scope.topic.status == 'inProgress'){
            sTopic.setEndsAt($scope.topic, endsAt).then(function(res){
                $state.go("topics.view", {
                    id: $state.params.id
                });
            });
        }
    };
    var voteRead = function(topicId, voteId) {
        if ($scope.app.user && $scope.app.user.loggedIn) {
            return sTopic.voteRead(topicId, voteId);
        } else {
            return sTopic.voteReadUnauth(topicId, voteId);
        }
    };
    $scope.loadTopic = function(){
        if(!$scope.topic.id){
                $state.go("topics.view", {
                id: $state.params.id
            });
        }
        $scope.endsAt = new Date($scope.topic.endsAt);
        $scope.form.endsAt = $scope.endsAt;
        if ($scope.topic.vote.id != undefined) {
            voteRead($scope.topic.id, $scope.topic.vote.id).then(function(res) {
                $scope.vote = res.data.data;
                $scope.endsAt = new Date($scope.vote.endsAt);
                $scope.form.endsAt = $scope.endsAt;
                var today=new Date();
                 $scope.form.numberOfDaysLeft = Math.round(($scope.form.endsA - today) / (1e3 * 60 * 60 * 24));
            }, function() {});
        }

    }
    $scope.loadTopic();
} ]);
