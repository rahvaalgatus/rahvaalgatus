"use strict";

app.controller("TopicCtrl", [ "$scope", "$rootScope", "$sce", "$compile", "$state", "$filter", "$log", "$timeout", "ngDialog", "sTopic", "sTranslate", "sAuth", function($scope, $rootScope, $sce, $compile, $state, $filter, $log, $timeout, ngDialog, sTopic, sTranslate, sAuth) {

    $scope.topic = {
        id: null,
        title: null,
        description: '<!DOCTYPE HTML><html><body><h1>Lühike, selge ja kokkuvõtlik pealkiri algatusele</h1><br><p>Lühike (u 350 tähemärki) või säutsu-lühike (140 tähemärki) sisukokkuvõte – see oleks mõeldud selleks, et algatusi platvormis ja sotsiaalmeedias paremini kajastada</p><br><h2>Ettepanek - </h2><br><p>Mida tahetakse muuta</p><br><h2>Põhjendus - </h2><br><p>Miks see on oluline</p><br><p>Kogu see tekstimaht maksimaalselt 12 000 tähemärki</p><br></body></html>',
        status: null,
        visibility: null,
        categories: [],
        endsAt: null,
        permission: {
            level: null
        },
        upUrl: null
    };
    $scope.topicEvents = {
      status: null,
      list:   []
    };
    $scope.notConfirmedRead = false;
    $scope.dateNotSet = false;
    $scope.topictype;
    $scope.topicComments = {
        rows: null,
        counts: {
            pro: 0,
            con: 0
        },
        orderBy: sTopic.COMMENT_ORDER_BY.date
    };
    $scope.topicContent = "";
    $scope.memberslist = [];
    $scope.membersToCall = [];
    $scope.understandConditions = false;
    $scope.COMMENT_ORDER_BY = sTopic.COMMENT_ORDER_BY;
    $scope.app.isTopicLoading = true;
    $scope.topicLoadSuccess = true;
    $scope.CATEGORIES = sTopic.CATEGORIES;
    $scope.CATEGORIES_COUNT_MAX = sTopic.CATEGORIES_COUNT_MAX;
    $scope.today = new Date();
    $scope.items = [];
    var topicRead = function(topicId) {
        if ($scope.app.user && $scope.app.user.loggedIn) {
            return sTopic.read({
                id: topicId
            });
        } else {
            return sTopic.readUnauth({
                id: topicId
            });
        }
    };
    var progress = function() {
        var end;
        $scope.items = [];
        $scope.topicended = false;
        var start = new Date($scope.topic.createdAt);
        var fullwidth = 850;
        if ($scope.topic.status == "voting") {
            end = new Date($scope.vote.endsAt);
        } else {
            end = new Date($scope.topic.endsAt);
        }
        if (end >= new Date()) {
            $scope.daysToDeadline = Math.round((end - $scope.today) / (1e3 * 60 * 60 * 24));
            $scope.topic.numberOfDaysLeft = $scope.daysToDeadline;
            $scope.daynow = Math.round((new Date() - start) / (1e3 * 60 * 60 * 24));
            $scope.fullDiff = Math.round((end - start) / (1e3 * 60 * 60 * 24));
            if ($scope.topic.status == "voting") {
                $scope.vote.numberOfDaysLeft = ($scope.daysToDeadline +1);
                var createdate = new Date($scope.vote.createdAt);
                console.log;
                var day = Math.round((createdate - start) / (1e3 * 60 * 60 * 24));
                if (day != 0) $scope.items.push({
                    date: createdate,
                    day: day,
                    type: "voteitem"
                });
            }
        } else {
            $scope.daysToDeadline = Math.round((new Date() - start) / (1e3 * 60 * 60 * 24));
            $scope.topic.numberOfDaysLeft = $scope.daysToDeadline;
            $scope.daynow = Math.round((new Date() - start) / (1e3 * 60 * 60 * 24));
            $scope.topicended = true;
            $scope.fullDiff = Math.round((new Date() - start) / (1e3 * 60 * 60 * 24));
            if (end < $scope.today) {
                var day = Math.round(($scope.today - end) / (1e3 * 60 * 60 * 24));
                console.log(day);
                if ($scope.topic.status == "voting") {
                    $scope.items.push({
                        date: $scope.vote.endsAt,
                        day: day,
                        type: "voteitem"
                    });
                }
            }
        }
        var extra = 0;
        var nowitem = {
            day: $scope.daynow,
            date: new Date(),
            id: "nowProgress",
            type: "now"
        };
        if ($scope.topicended) {
            nowitem.ended = true;
            if(!$scope.hasVotesRequired){
                nowitem.src = "images/role-not.png";
            }
            else{
                nowitem.src = "images/role-active-green.png";

            }
            nowitem.width = 30;
            extra = extra+30;
        }
        else{
            extra = extra + 136;
            nowitem.width = 136;
        }
        var itemcount  = Object.keys($scope.items).length;
        extra = extra+(itemcount*30);
        $scope.items.push(nowitem);
        itemcount++;
        fullwidth = fullwidth-extra;
        var daylength = Math.floor(fullwidth/$scope.fullDiff);
        var lastday = 0;
        angular.forEach($scope.items, function(item, key) {
            item.id = "item-" + key;
            if (item.type == "voteitem") {
                item.src = "images/role-active-green.png";
                item.left = ((item.day - lastday) * daylength)
            }
            else if(item.type !='now'){
                item.src = "images/role-active.png";
                item.left = ((item.day - lastday) * daylength)
            }
            else{
                 item.left = ((item.day - lastday) * daylength)
            }
            $scope.items[key] = item;
            lastday = item.day;
        });
        console.log($scope.items);
    };
    var readMembers = function(topicId) {
        sTopic.membersList(topicId).then(function(res) {
            $scope.memberslist = res.data.data.users.rows;
            angular.forEach($scope.memberslist, function(member, key) {
                console.log(member);
                if (member.id == $scope.topic.creator.id) {
                    $scope.memberslist.splice(key, 1);
                }
            });
        });
    };
    var voteRead = function(topicId, voteId) {
        if ($scope.app.user && $scope.app.user.loggedIn) {
            return sTopic.voteRead(topicId, voteId);
        } else {
            return sTopic.voteReadUnauth(topicId, voteId);
        }
    };
    var getContentHtml = function(topic) {
        $scope.shortDescription = $scope.htmlToPlaintext(topic.description).replace(topic.title,"").substring(0,200)+"...";
        $scope.topicContent = $sce.trustAsHtml(topic.description);
    };
    $scope.goToComments = function(){
        var top = $('#commentBlock').position().top;
        $(window).scrollTop( top );
    }
    $scope.doTopicLoad = function() {
        if ($state.current.name.indexOf("topic") !== -1) {
            $scope.app.isTopicLoading = true;
            topicRead($state.params.id).then(function(res) {
                var topic = res.data.data;
                getContentHtml(topic);
                if ($state.current.name == "topics.view" && topic.vote.id !== undefined && topic.vote.id !== null) {
                    $state.go("topics.view.vote.view", {
                        id: topic.id,
                        voteId: topic.vote.id
                    });
                }
                if (topic.endsAt != null) {
                    topic.endsAt = new Date(topic.endsAt);
                }
                topic.padUrl = $sce.trustAsResourceUrl(topic.padUrl);
                angular.copy(topic, $scope.topic);
                if (topic.vote.id != undefined) {
                    voteRead(topic.id, topic.vote.id).then(function(res) {
                        $scope.vote = res.data.data;
                        $scope.vote.yesindex = _.findIndex($scope.vote.options.rows, function(o) {
                            return o.value == "Yes";
                        });
                        $scope.vote.noindex = _.findIndex($scope.vote.options.rows, function(o) {
                            return o.value == "No";
                        });
                        $;
                        //scope.topic.endsAt = new Date($scope.vote.endsAt);
                        progress();
                    }, function() {
                    });
                } else {
                    progress();
                }
                $log.debug("Topic loaded!", topic);
                $scope.loadComments();
            }, function(res) {
                $log.error("Topic read failed", res);
                $scope.topicLoadSuccess = false;
            }).finally(function() {
                $scope.app.isTopicLoading = false;
            });

            $scope.topicEvents.status = 'loading';
            sTopic.eventsList($state.params.id).then(function(events) {
              $scope.topicEvents.status = 'loaded';
              $scope.topicEvents.list = events;
            }, function(error) {
              $scope.topicEvents.status = 'failed';
            });
        }
    };
    if ($state.params.id) {
        $scope.doTopicLoad();
    }
    $rootScope.$on("$stateChangeStart", function(event, toState, toParams, fromState, fromParams) {
        if (fromParams.id != toParams.id) $state.params.id = toParams.id;
        if ($state.params.id) $scope.doTopicLoad();
        ngDialog.closeAll();
    });
    $scope.$on("topic.members.change", function(event, data) {
        topicRead(data.id).then(function(res) {
            var topic = res.data.data;
            angular.copy(topic, $scope.topic);
            $log.debug("Topic loaded on topic.members.change!", topic);
        }, function(res) {
            $log.error("Topic read failed on topic.members.change!", res);
        });
    });
    $scope.$watch("topic.endsAt", function(newValue, oldValue) {
        if (!newValue) return;
        newValue = new Date(newValue);
        var diffTime = newValue.getTime() - new Date().getTime();
        $scope.topic.numberOfDaysLeft = Math.ceil(diffTime / (1e3 * 3600 * 24));
        var testtime =  (moment(new Date()).add(2, "y").toDate().getTime() - new Date().getTime());
        var numberdays = Math.ceil(testtime / (1e3 * 3600 * 24));
        if($scope.topic.numberOfDaysLeft > numberdays){
            $scope.topic.endsAt = moment(new Date()).add(2, "y").toDate();
        }
    });
    $scope.loadComments = function() {
        if (!$scope.topic.id) return;
        var success = function(res) {
            var comments = res.data.data.rows;
            $scope.topicComments.rows = comments;
            $scope.topicComments.counts.pro = _.filter($scope.topicComments.rows, {
                type: sTopic.COMMENT_TYPES.pro
            }).length;
            $scope.topicComments.counts.con = _.filter($scope.topicComments.rows, {
                type: sTopic.COMMENT_TYPES.con
            }).length;
            $log.debug("Topic comments loaded!", comments);
        };
        var error = function(err, res) {
            $log.error("Topic comments load failed", err, res);
        };
        if ($scope.app.user && $scope.app.user.loggedIn) {
            sTopic.commentList($scope.topic.id, $scope.topicComments.orderBy).then(success, error);
        } else {
            sTopic.commentListUnauth($scope.topic.id, $scope.topicComments.orderBy).then(success, error);
        }
    };
    $scope.triggerStart = function(type) {
        if ($scope.understandConditions && $scope.app.user.loggedIn) {
            $scope.notConfirmedRead = false;
            console.log($scope.topic);
            sTopic.create($scope.topic).then(function(res) {
                var topic = res.data.data;
                $log.log("Created!", topic);
                angular.copy(topic, $scope.topic);
                $scope.topictype=type;
                $state.go("topics.create2", {
                    id: topic.id
                });
            }, function(res) {
                $log.log("Topic creation failed", res);
                $scope.app.showError(_.values(res.data.errors));
                $scope.app.isTopicLoading = false;
            });
        }
        else if(!$scope.understandConditions){
            $scope.notConfirmedRead = true;
        }
    };
    $scope.createDeadlineEnd = function(deadline) {
        var topic = $scope.topic;
        if($scope.topic.endsAt !==null){
            $scope.dateNotSet = false;
            if (deadline) {
                deadline = new Date(deadline);
                $scope.topic.endsAt = deadline;
                sTopic.setEndsAt(topic, deadline).then(function(res) {
                    $log.log("Updated!", res);
                }, function(res) {
                    $log.log("Topic update/creation failed", res);
                    $scope.app.showError(_.values(res.data.errors));
                });
            }
            $state.go("addCoauthors", {
                id: topic.id
            });
        }
        else{
            $scope.dateNotSet = true;
        }
    };
    $scope.coAuthorsAdded = function() {
        var topic = $scope.topic;
        $state.go("topics.view", {
            id: topic.id
        });
    };
    $scope.doSetVisibility = function(visibility) {
        if (!visibility || $scope.topic.visibility === visibility) return;
        //  if(visibility ==)
        console.log(visibility);
        if (visibility == "public") {
            sTopic.update({
                id: $scope.topic.id,
                visibility: visibility,
                permission: {
                    level: "read"
                }
            }).then(function(result) {
                $log.debug("Topic visibility update succeeded", result);
                $scope.topic.visibility = visibility;
                $scope.topic.permission.level = "read";
            }, function(result) {
                $log.error("Topic visibility update failed", result);
            });
        } else {
            sTopic.update({
                id: $scope.topic.id,
                visibility: visibility
            }).then(function(result) {
                $log.debug("Topic visibility update succeeded", result);
                $scope.topic.visibility = visibility;
            }, function(result) {
                $log.error("Topic visibility update failed", result);
            });
        }
    };
    $scope.checkConditionsRead = function() {
        if ($scope.understandConditions == false) {
            $scope.understandConditions = true;
        } else {
            $scope.understandConditions = false;
        }
    };
    $scope.$watch(function() {
        return $scope.topicComments.orderBy;
    }, function(newVal, oldVal) {
        if (newVal !== oldVal) {
            $scope.loadComments();
        }
    });
    $scope.canEdit = function() {
        return !$scope.topic.id || [ sTopic.LEVELS.admin, sTopic.LEVELS.edit ].indexOf($scope.topic.permission.level) > -1 && !sTopic.isStatusDisabled($scope.topic.status);
    };
    $scope.canInvite = function() {
        return $scope.topic.id && $scope.topic.permission.level == sTopic.LEVELS.admin;
    };
    $scope.canComment = function() {
        if ($scope.topic.visibility === sTopic.VISIBILITY.public) {
            return $scope.app.user && $scope.app.user.loggedIn;
        } else {
            return !!$scope.topic.id;
        }
    };
    // TODO: This logic is kinda duplicate in DashboardCtrl
    $scope.canSendToFollowUp = function() {
        return $scope.topic.vote && $scope.topic.vote.id && $scope.topic.permission.level == sTopic.LEVELS.admin && $scope.topic.status !== sTopic.STATUSES.followUp;
    };
    $scope.isAdmin = function() {
        return $scope.topic.permission.level == sTopic.LEVELS.admin;
    };
    $scope.isFollowUp = function() {
        return $scope.topic.status === sTopic.STATUSES.followUp;
    };
    $scope.isClosed = function() {
        return $scope.topic.status === sTopic.STATUSES.closed;
    };
    $scope.isShowInVotingNotification = function() {
        return $scope.topic.status === sTopic.STATUSES.voting && !$filter("includedByState")("topics.view.vote");
    };
    $scope.doUpdate = function() {
        sTopic.update($scope.topic).then(function(res) {
            $log.log("Updated!", res);
        }, function(res) {
            $log.log("Topic update/creation failed", res);
            $scope.app.showError(_.values(res.data.errors));
        });
    };
    $scope.doDelete = function() {
        ngDialog.openConfirm({
            template: "/templates/modals/topicConfirmDelete.html"
        }).then(function() {
            sTopic.delete($scope.topic.id).then(function(result) {
                $log.log("Topic was deleted successfully", result);
                $state.go("dashboard");
            }, function(result) {
                $log.log("Topic deletion failed", result);
            });
        }, angular.noop);
    };
    $scope.doCommentVote = function(commentId, value) {
        if (!$scope.app.user.loggedIn) return;
        sTopic.commentVoteCreate($scope.topic.id, commentId, value).then(function(result) {
            $log.log("Comment vote succeeded!", result.data);
            _.find($scope.topicComments.rows, {
                id: commentId
            }).votes = result.data.data;
        }, function(result) {
            $log.log("Comment vote failed!", result);
        });
    };
    $scope.doCommentVoteReply = function(commentId, commentIdReply, value) {
        sTopic.commentVoteCreate($scope.topic.id, commentIdReply, value).then(function(result) {
            $log.log("Comment reply vote succeeded!", result.data);
            var comment = _.find($scope.topicComments.rows, {
                id: commentId
            });
            var reply = _.find(comment.replies.rows, {
                id: commentIdReply
            });
            reply.votes = result.data.data;
        }, function(result) {
            $log.log("Comment reply vote failed!", result);
        });
    };
    $scope.doCommentOrderBy = function(orderBy) {
        $log.debug("Comments order by", orderBy);
        $scope.topicComments.orderBy = orderBy;
    };
    // TODO: This logic is kinda duplicate in DashboardCtrl
    $scope.setTopicStatusToFollowUp = function(topic) {
        ngDialog.openConfirm({
            template: "/templates/modals/topicConfirmFollowUp.html"
        }).then(function() {
            var newStatus = sTopic.STATUSES.followUp;
            sTopic.setStatus(topic, newStatus).then(function() {
                $state.go("topics.view", {
                    id: topic.id
                });
            }, function(err) {
                $log.error("Failed to set Topic status", topic, err);
            });
        }, angular.noop);
    };
    $scope.deleteMemberUser = function(userId) {
        sTopic.memberUserDelete($scope.topic.id, userId).then(function(res) {
            $log.log("Member user delete success!", $scope.topic.id, userId);
            angular.forEach($scope.memberslist, function(member, key) {
                if (member.id == userId) {
                    $scope.memberslist.splice(key, 1);
                }
            });
        }, function(res) {
            $log.error("Topic member user deletion failed!", res, $scope.topic, userId);
        });
    };
    $scope.setTopicStatusToClosed = function(topic) {
        ngDialog.openConfirm({
            template: "/templates/modals/topicConfirmClosed.html"
        }).then(function() {
            var newStatus = sTopic.STATUSES.closed;
            sTopic.setStatus(topic, newStatus).then(function() {
                $scope.topic.status = newStatus;
            }, function(err) {
                $log.error("Failed to set Topic status", topic, err);
            });
        }, angular.noop);
    };
    $scope.setHashtag = function() {
        ngDialog.open({
            template: "/templates/modals/topicSetHashtag.html",
            scope: $scope
        });
    };
    $scope.submitHashtag = function() {
        ngDialog.open({
            template: "/templates/modals/topicSetHashtag.html",
            scope: $scope
        });
    };
    $scope.renewDeadline = function() {
        ngDialog.open({
            template: "/templates/modals/topicRenewDeadline.html",
            scope: $scope
        });
    };
    $scope.setTopicStatusToVoting = function(topic) {
        ngDialog.openConfirm({
            template: "/templates/modals/topicConfirmFollowUp.html"
        }).then(function() {
            var newStatus = sTopic.STATUSES.voting;
            sTopic.setStatus(topic, newStatus).then(function() {
                topic.status = newStatus;
            }, function(err) {
                $log.error("Failed to set Topic status", topic, err);
            });
        }, angular.noop);
    };
    $scope.reopenTopic = function(topic) {
        ngDialog.openConfirm({
            template: "/templates/modals/topicConfirmReopen.html"
        }).then(function() {
            var newStatus = sTopic.STATUSES.voting;
            if($scope.topic.status !=='voting'){
                sTopic.setStatus(topic, newStatus).then(function() {
                    $scope.topic.status = newStatus;

                }, function(err) {
                    $log.error("Failed to set Topic status", topic, err);
                });
            }else{
                if($scope.vote){
                    var datediff = Math.round((new Date($scope.vote.endsAt) - new Date()) / (1e3 * 60 * 60 * 24));
                    console.log(datediff);
                    if(datediff < 0){
                        var endsAt = new Date();
                        endsAt.setHours(23,59,59);
                        sTopic.voteUpdate($scope.topic.id,$scope.vote.id, endsAt).then(function(res){
                            $state.go("topics.view", {
                                id: $state.params.id
                            });
                        });
                    }
                }
            }
        }, angular.noop);
    };
    // TODO: This logic is kinda duplicate in DashboardCtrl
    $scope.doLeaveTopic = function(topic) {
        ngDialog.openConfirm({
            template: "/templates/modals/topicConfirmLeave.html"
        }).then(function() {
            sTopic.memberUserDelete(topic.id, sAuth.user.id).then(function() {
                $state.go("dashboard");
            }, function(err) {
                $log.error("Failed to leave Topic", topic, err);
                sTranslate.errorsToKeys(err, "TOPIC");
                $scope.app.showError(err.data.status.message);
            });
        }, angular.noop);
    };
    $scope.updateCategories = function(category) {
        var categoryIndex = $scope.topic.categories.indexOf(category);
        if (categoryIndex > -1) {
            $scope.topic.categories.splice(categoryIndex, 1);
        } else {
            if ($scope.topic.categories.length < $scope.CATEGORIES_COUNT_MAX) {
                $scope.topic.categories.push(category);
                console.log($scope.topic.categories);
            }
        }
        $scope.doUpdate();
    };
    $scope.isCategorySelected = function(category) {
        return $scope.topic.categories.indexOf(category) > -1;
    };
    /**
     * Used by textAngular ta-paste solving the issue of Chrome adding useless elements and attributes on paste.
     * Not ideal, but works.
     *
     * There is a taFixChrome function in textAngular source, but that does not fix the problems.
     *
     * @see https://github.com/fraywing/textAngular/issues/534 - wait for this to be fixed, then we can possibly remove the code
     * @see https://github.com/fraywing/textAngular/issues/642 - fix proposed
     */
    $scope.htmlToPlaintext = function(html) {
        return $filter("htmlToPlaintext")(html);
    };
    $scope.termsModal = function() {
        ngDialog.open({
            template: "/templates/modals/topic_terms.html",
            scope: $scope
        });
    };
    $scope.createNewVersion = function() {
        console.log($scope.topic);
    };
} ]);
