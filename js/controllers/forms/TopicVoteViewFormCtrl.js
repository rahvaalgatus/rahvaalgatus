"use strict";

app.controller("TopicVoteViewFormCtrl", [ "$scope", "$rootScope", "$state", "$log", "$q", "ngDialog", "toruConfig", "sTopic", function($scope, $rootScope, $state, $log, $q, ngDialog, toruConfig, sTopic) {
    $scope.vote = null;
    $scope.voteCountTotal = 0;
    $scope.voteDelegationList = [];
    // List of Users vote can be delegated to
    $scope.showVoteClose = false;
    $scope.showVoteDelegation = false;
    $scope.hasVoted = false;
    $scope.hasEnded = false;
    $scope.userVoteValue = null;
    $scope.voteAuthTypes = sTopic.VOTE_AUTH_TYPES;
    $scope.voteTypes = sTopic.VOTE_TYPES;
    $scope.hasVotesRequired = false;
    $scope.loading = true

    function voteRead(topicId, voteId) {
        if ($scope.app.isLoggedIn()) {
            return sTopic.voteRead(topicId, voteId);
        } else {
            return sTopic.voteReadUnauth(topicId, voteId);
        }
    };

    $scope.init = function(options, bdocUri) {
      if ($scope.topic.vote == null) return
      $state.params.voteId = $scope.topic.vote.id

        return voteRead($state.params.id, $state.params.voteId).then(function(res) {
            var vote = res.data.data;
            $scope.option = vote.options.rows[0];
            $scope.optionRevoke = vote.options.rows[1];
            $scope.vote = vote;
            $scope.showVoteDelegation = !!vote.delegation;
            if (!$scope.app.isLoggedIn()) {
                var selectedOptionIds = _.pluck(options, "id");
                $scope.vote.options.rows.forEach(function(option) {
                    if (selectedOptionIds.indexOf(option.id) > -1) {
                        option.selected = true;
                    }
                });
            }
            $scope.voteCountTotal = getVoteCountTotal();
            $scope.hasVoted = getUserHasVoted();
            $scope.hasEnded = getVoteHasEnded();
            $scope.hasVotesRequired = hasVotesNeeded();

            // For unauthenticated voting, the bdocUri is passed in init() to show download url
            if (bdocUri) {
                $scope.vote.downloads = {
                    bdocVote: bdocUri
                };
            }

            $scope.loading = false;
        }, function(res) {
            $log.error("Vote load failed!", res);
        });
    };

    $scope.$watch(function() {
        return $scope.loading;
    }, function() {
        if (!$scope.loading) $scope.hasEnded = getVoteHasEnded();
    });

    $scope.getOptionLetter = function(index) {
        return String.fromCharCode(65 + index);
    };

    $scope.getOptionTheme = function(option) {
        var theme;
        switch (option.value.toLowerCase()) {
          case "yes":
            theme = "theme-1";
            break;

          case "no":
            theme = "theme-2";
            break;

          case "neutral":
            theme = "theme-3";
            break;

          default:
            theme = "theme-4";
        }
        if (option.selected) {
            return theme + " active";
        }
        return theme;
    };
    $scope.getVoteValuePercentage = function(value) {
        if (!$scope.voteCountTotal || value < 1) return 0;
        return value / $scope.voteCountTotal * 100;
    };
    $scope.isAuthTypeHard = function() {
        return $scope.vote && $scope.vote.authType === $scope.voteAuthTypes.hard;
    };
    $scope.doVote = function(option) {
        if (!$scope.canVote() || $scope.topic.status !== sTopic.STATUSES.voting) return;
        if ($scope.isAuthTypeHard()) {
            ngDialog.open({
                scope: $scope,
                template: "/templates/modals/topic_vote_sign.html",
                data: {
                    topicId: $state.params.id,
                    voteId: $state.params.voteId,
                    options: [ option ]
                },
                preCloseCallback: function(data) {
                    if (data) {
                        return $scope.init(data.options, data.bdocUri);
                    }
                }
            });
            return;
        }
        sTopic.voteVote($state.params.id, $state.params.voteId, [ {
            optionId: option.id
        } ]).then(function(res) {
            $scope.init();
        });
    };
    $scope.doDelegate = function(user) {
        sTopic.voteDelegationCreate($state.params.id, $state.params.voteId, user.id).then(function(res) {
            $log.log("Delegation success", res);
            $scope.init();
        }, function(res) {
            $log.error("Delegation failure", res);
            if (res.status === 400) {
                $scope.app.showError(res.data.status.message);
            }
        });
    };
    $scope.doRevokeDelegation = function() {
        sTopic.voteDelegationDelete($state.params.id, $state.params.voteId).then(function(res) {
            $log.log("Delegation deletion succeeded", res);
            $scope.init();
        }, function(res) {
            $log.error("Delegation deletion failure", res);
        });
    };
    $scope.doVoteClose = function() {
        //TODO!
        $log.log("doVoteClose - Not implemented!");
        $scope.showVoteClose = false;
    };
    $scope.doToggleVoteClose = function() {
        $scope.showVoteClose = !$scope.showVoteClose;
    };
    $scope.doToggleVoteDelegation = function() {
        $scope.showVoteDelegation = !$scope.showVoteDelegation;
        if ($scope.showVoteDelegation && !$scope.voteDelegationList.length && !$scope.vote.delegation) {
            // TODO: could use special endpoint for fetching only Users/Groups or filter on the same endpoint, right now fetches also Groups which we do not need
            sTopic.membersList($scope.topic.id).then(function(res) {
                $log.log("Member list fetch success", res);
                var users = res.data.data.users.rows;
                for (var i in users) {
                    var user = users[i];
                    if (user.id == $scope.app.user.id) {
                        // Skip logged in user.
                        continue;
                    }
                    $scope.voteDelegationList.push(user);
                }
            }, function(res) {
                $log.error("Member list fetch failed", res);
            });
        }
    };
    $scope.canVote = function() {
        return $scope.vote && ($scope.topic.permission.level !== sTopic.LEVELS.none || $scope.isAuthTypeHard() && $scope.topic.visibility === sTopic.VISIBILITY.public);
    };
    $scope.isVoteDelegationVisible = function() {
        return $scope.canVote() && $scope.vote.delegationIsAllowed && !$scope.hasVoted && $scope.topic && $scope.topic.members.users.count > 1 && (!$scope.hasEnded || $scope.vote.delegation);
    };
    $scope.isRegularVote = function() {
        return $scope.vote && $scope.vote.type == $scope.voteTypes.regular;
    };
    var getVoteCountTotal = function() {
        var voteCountTotal = 0;
        if ($scope.vote && $scope.vote.options) {
            var options = $scope.vote.options.rows;
            for (var i in options) {
                var voteCount = options[i].voteCount;
                if (voteCount && options[i].value == "Yes") {
                    voteCountTotal += voteCount;
                }
            }
        }
        return voteCountTotal;
    };
    var getUserHasVoted = function() {
        if ($scope.vote && $scope.vote.options) {
            var options = $scope.vote.options.rows;
            for (var i in options) {
                if (options[i].selected && options[i].value == "Yes") {
                    $scope.userVoteValue = options[i].value;
                    return true;
                }
            }
        }
        return false;
    };
    var getVoteHasEnded = function() {
        if ([ sTopic.STATUSES.followUp, sTopic.STATUSES.closed ].indexOf($scope.topic.status) > -1) {
            return true;
        }
        return $scope.vote && $scope.vote.endsAt && new Date() > new Date($scope.vote.endsAt);
    };
    var hasVotesNeeded = function(){
        if($scope.vote){
            for(var i=0; i<$scope.vote.options.rows.length; i++){
                var member = $scope.vote.options.rows[i];
                if (member.value == 'Yes' && member.voteCount >= Config.VOTES_REQUIRED) {
                    return true;
                    i = 100;
                }
                else if(member.value == 'Yes' && member.voteCount < Config.VOTES_REQUIRED){
                    return false;
                    i = 100;
                }
            }
        }else{
            return false;
        }
    };

    function onVote() { return $scope.topic.vote }
    $scope.$watch(onVote, $scope.init.bind($scope))
}]);
