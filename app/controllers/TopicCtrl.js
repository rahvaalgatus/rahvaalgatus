var _ = require("lodash")
var Raven = window.Raven
var Config = require("root/config")
var angular = require("angular")
var moment = require("moment")
var app = require("root/app")
var DOCTYPE = "<!DOCTYPE HTML>"

app.controller("TopicCtrl", [
	"$scope", "$rootScope", "$sce", "$compile", "$state", "$filter", "$log", "$timeout", "ngDialog", "sTopic", "sTranslate", "sAuth", "sProgress",
	function($scope, $rootScope, $sce, $compile, $state, $filter, $log, $timeout, ngDialog, sTopic, sTranslate, sAuth, Progress) {
    $scope.page = ""

		$scope.topic = {
			id: null,
			title: "",
			description: "<!DOCTYPE HTML><html><body><h1></h1><br><p>Lühike (u 350 tähemärki) või säutsu-lühike (140 tähemärki) sisukokkuvõte – see oleks mõeldud selleks, et algatusi platvormis ja sotsiaalmeedias paremini kajastada</p><br><h2>Ettepanek - </h2><br><p>Mida tahetakse muuta</p><br><h2>Põhjendus - </h2><br><p>Miks see on oluline</p><br><p>Kogu see tekstimaht maksimaalselt 12 000 tähemärki</p><br></body></html>",
			status: null,
			visibility: null,
			categories: [],
			endsAt: moment().startOf("day").add(Config.MIN_DEADLINE_DAYS, "day").endOf("day").toDate(),
			permission: {
				level: null
			},
			upUrl: null,
			contact: {name: "", email: "", phone: ""}
		};
		$scope.topicEvents = {
			status: null,
			list:   []
		};
		$scope.notConfirmedRead = false;
		$scope.dateNotSet = false;
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
		$scope.today = new Date();
		$scope.progress = new Progress();

		function recalculateProgress() {
			$scope.progress.recalculate($scope.topic, $scope.vote, $scope.hasVotesRequired, $scope.topicEvents.list);
		};

		function topicRead(topicId) {
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

		function voteRead(topicId, voteId) {
			if ($scope.app.user && $scope.app.user.loggedIn) {
				return sTopic.voteRead(topicId, voteId);
			} else {
				return sTopic.voteReadUnauth(topicId, voteId);
			}
		};

		$scope.doTopicLoad = function() {
      $scope.app.isTopicLoading = true;

      topicRead($state.params.id).then(function(res) {
        var topic = res.data.data

        if ($state.current.name == "topics.read") {
          var page
          if (topic.vote.id == null) page = "discussion"
          else if (topic.status == "followUp") page = "events"
          else page = "vote"

          return void $state.go("topics." + page, {id: topic.id})
        }

        $scope.shortDescription = $scope.htmlToPlaintext(topic.description).replace(topic.title, "").substring(0,200)+"...";
        $scope.topicContent = $sce.trustAsHtml(topic.description);

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
            //scope.topic.endsAt = new Date($scope.vote.endsAt);
            recalculateProgress();
          });

        } else {
          recalculateProgress();
        }

        $scope.loadComments();
      }, function(res) {
        $scope.topicLoadSuccess = false
      }).finally(function() {
        $scope.app.isTopicLoading = false
      });

      $scope.topicEvents.status = 'loading'

      sTopic.eventsList($state.params.id).then(function(events) {
        $scope.topicEvents.status = 'loaded';
        $scope.topicEvents.list = events;
        recalculateProgress();
      }, function(error) {
        $scope.topicEvents.status = 'failed';
      });
		}

		if ($state.params.id) $scope.doTopicLoad()

		var offStateChange = $rootScope.$on("$stateChangeStart", function(event, toState, toParams, fromState, fromParams) {
			if (fromParams.id != toParams.id) $state.params.id = toParams.id;
			if ($state.params.id) $scope.doTopicLoad();
			ngDialog.closeAll();
		});

		$scope.$on("$destroy", offStateChange)

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
			if($scope.topic.numberOfDaysLeft > numberdays) {
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
			};

			if ($scope.app.user && $scope.app.user.loggedIn) {
				sTopic.commentList($scope.topic.id, $scope.topicComments.orderBy).then(success);
			} else {
				sTopic.commentListUnauth($scope.topic.id, $scope.topicComments.orderBy).then(success);
			}
		};

		$scope.triggerStart = function(type) {
			if (!$scope.app.user.loggedIn) return

			if (!$scope.understandConditions)
				return void ($scope.notConfirmedRead = true)

			var topic = $scope.topic
			$scope.emptyTitle = false
			$scope.notConfirmedRead = false

			topic.description = formatDescription(topic.description, {
				title: topic.title
			})

			sTopic.create(topic).then(function(res) {
				var topic = res.data.data;
				angular.copy(topic, $scope.topic);
				$scope.topictype=type;
				$state.go("topics.deadline", {id: topic.id})
			}, function(res) {
				$scope.app.showError(_.values(res.data.errors));
				$scope.app.isTopicLoading = false;
			});
		};

		$scope.createDeadlineEnd = function(deadline) {
			var topic = $scope.topic;
			if($scope.topic.endsAt !==null){
				$scope.dateNotSet = false;

				if (deadline) {
					deadline = new Date(deadline);
					deadline.setHours(23, 59, 59, 999)
					$scope.topic.endsAt = deadline;
					sTopic.setEndsAt(topic, deadline).then(function(res) {
						$log.log("Updated!", res);
					}, function(res) {
						$log.log("Topic update/creation failed", res);
						$scope.app.showError(_.values(res.data.errors));
					});
				}
				$state.go("topics.authors", {id: topic.id})
			}
			else{
				$scope.dateNotSet = true;
			}
		};

		$scope.doSetVisibility = function(visibility) {
			if (!visibility || $scope.topic.visibility === visibility) return
	
			sTopic.update({
				id: $scope.topic.id,
				visibility: visibility
			}).then(function(result) {
				$scope.topic.visibility = visibility
			}).catch(console.error.bind(console))
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
			return $scope.topic.status === sTopic.STATUSES.voting && !$filter("includedByState")("topics.read.vote");
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
					$state.go("home");
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
			$scope.topicComments.orderBy = orderBy;
		};

		$scope.confirmTopicFollowUp = function(topic) {
			ngDialog.open({
				template: "/templates/modals/topicConfirmFollowUp.html",
				scope: $scope,
				closeByEscape: false,
				closeByDocument: false
			})
		};

		$scope.updateTopicStatusToFollowUp = function(topic) {
			$scope.savingTopic = true;

			sTopic.update({
				id: topic.id,
				status: sTopic.STATUSES.followUp,
				contact: topic.contact
			}).then(function() {
				$state.go("topics.read", {id: topic.id})
			}).catch(function(err) {
				$log.error("Failed to set Topic status", topic, err)
				$scope.savingError = err.data.status.message;
			}).finally(function() {
				$scope.savingEvent = false
			}).catch(Raven.captureException)
		}

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
						if(datediff < 0){
							var endsAt = new Date();
							endsAt.setHours(23,59,59);
							sTopic.voteUpdate($scope.topic.id,$scope.vote.id, endsAt).then(function(res){
								$state.go("topics.read", {id: $state.params.id});
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

		$scope.isProposable = function() {
			var topic = $scope.topic
			if (!$scope.isAdmin()) return false
			if (topic.visibility != "public") return false
			if (topic.vote && topic.vote.id) return false

			var createdOn = moment(topic.createdAt).startOf("day")
			var minDeadline = moment(createdOn).add(Config.MIN_DEADLINE_DAYS, "day")
			return new Date() >= minDeadline
		}
}]);

function formatDescription(html, attrs) {
	var el = document.createElement("html")
	el.innerHTML = html
	el.querySelector("h1").textContent = attrs.title
	return DOCTYPE + el.outerHTML
}
