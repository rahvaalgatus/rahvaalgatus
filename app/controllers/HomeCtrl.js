var _ = require("lodash")
var app = require("../app")
var angular = require("angular")

app.controller("HomeCtrl", [ "$scope", "$rootScope", "$state", "$kookies", "$log", "toruSessionSettings", "sTopic","ngDialog", function($scope, $rootScope, $state, $kookies, $log, toruSessionSettings, sTopic, ngDialog) {
    $scope.isTopicListLoading = true;
    $scope.searchString = null;
    $scope.searchResults = [];
    $scope.today = new Date();
    var CATEGORY_THEME = {
        politics: "theme-1",
        // Politics and public administration
        taxes: "theme-2",
        // Taxes and budgeting
        defense: "theme-3",
        //  Defense and security
        environment: "theme-4",
        // Environment, animal protection
        agriculture: "theme-5",
        // Agriculture
        culture: "theme-6",
        // Culture, media and sports
        communities: "theme-7",
        // Communities and urban development
        integration: "theme-8",
        // Integration and human rights
        business: "theme-9",
        // Business and industry
        work: "theme-10",
        // Work and employment
        transport: "theme-11",
        // Public transport and road safety
        health: "theme-12",
        // Health care and social care
        education: "theme-13",
        // Education
        varia: "theme-14"
    };
    var SETTINGS_DISCLAIMER_KEY = "isDisclaimerHidden";
    $scope.isDisclaimerHidden = !!toruSessionSettings.get("isDisclaimerHidden") || false;
    //TODO: As the DOM is totally different from any other select (the actual dropdown list is not inside the element itself). I will now implement all the select logic in controller
    $scope.filters = {
        statuses: {
            isVisible: false,
            value: null,
            options: _.values(sTopic.STATUSES)
        },
        categories: {
            isVisible: false,
            value: null,
            options: _.values(sTopic.CATEGORIES)
        },
        orderBy: {
            isVisible: false,
            value: null
        },
        limit: 6,
        voting_offset: 0,
        followUp_offset: 0,
        discussion_offset: 0,
        infiniteScrollDisabled: true
    };
    $scope.filters.toggleSelect = function(filterName) {
        Object.keys($scope.filters).forEach(function(filter) {
            var o = $scope.filters[filter];
            if (filter == filterName) {
                o.isVisible = !o.isVisible;
            } else {
                o.isVisible = false;
            }
        });
    };
    $scope.filters.changeStatus = function(status) {
        if (status !== $scope.filters.statuses.value) {
            $scope.filters.statuses.value = status;
        } else {
            $scope.filters.statuses.value = null;
        }
        $scope.topicList = [];
        $scope.filters.infiniteScrollDisabled = false;
        $scope.filters.offset = 0;
        $scope.loadTopicList();
    };
    $scope.filters.changeCategory = function(category) {
        if (category !== $scope.filters.categories.value) {
            $scope.filters.categories.value = category;
        } else {
            $scope.filters.categories.value = null;
        }
        $scope.topicList = [];
        $scope.filters.infiniteScrollDisabled = false;
        $scope.filters.offset = 0;
        $scope.loadTopicList();
    };
    $scope.topicList = [];
    $scope.followuptopicList = [];
    $scope.votingtopicList = [];
    $scope.rangefollowuptopicList = new Array(1);
    $scope.rangevotingtopicList = new Array(1);
    $scope.rangediscussiontopicList = new Array(1);
    $scope.discussiontopicList = [];
    // Running request, so I can cancel it if needed.
    var loadTopicListPromise = null;
    $scope.dateDiff = function(start, end) {
        if (start == undefined) {
            start = new Date();
        }
        if (end == undefined) {
            end = new Date();
        }
        start = new Date(start);
        end = new Date(end);
        return Math.round((end - start) / (1e3 * 60 * 60 * 24));
    };
    $scope.getProgress = function(topic) {
        if (topic.status == "inProgress") {
            var fullwidth = $scope.dateDiff(topic.createdAt, topic.endsAt);
            var now = new Date();
            var curpos = $scope.dateDiff(topic.createdAt, now);
            if(fullwidth == '-0'){
                percent =100;
            }
            else{
                var percent = curpos / fullwidth * 100;
            }
            if (percent > 100) percent = 100;
            if(topic.endsAt <= now)
                percent = 100;
            return {
                width: percent + "%"
            };
        }
        if (topic.status == "voting") {
            var votes = 0;
            if (topic.vote !== undefined) {
                if (topic.vote.options.rows[topic.vote.yesindex].voteCount !== undefined) {
                    votes = topic.vote.options.rows[topic.vote.yesindex].voteCount;
                }
            }
            var percent = votes / 1e3 * 100;
            if (percent > 100) percent = 100;
            return {
                width: percent + "%"
            };
        }
    };
    $scope.loadTopicList = function() {
        // Disable infiniteScroll loading whyle fetching new data
        var offset = $scope.filters.offset;
        var limit = $scope.filters.limit;
        $scope.filters.infiniteScrollDisabled = true;
        $scope.isTopicListLoading = true;
        if (loadTopicListPromise) {
            loadTopicListPromise.abort();
        }
        if ($scope.searchString != null) {
            limit = 1e3;
            offset = 0;
        }
        loadTopicListPromise = sTopic.listUnauth($scope.filters.statuses.value, $scope.filters.categories.value, offset, limit);
        loadTopicListPromise.then(function(res) {
            var topics = res.data.data.rows;
            if ($scope.searchString != null && !$scope.searchResults[$scope.searchString]) {
                if (!$scope.searchResults[$scope.searchString]) {
                    $scope.searchResults[$scope.searchString] = [];
                    angular.forEach(sTopic.STATUSES, function(value, key) {
                        $scope.searchResults[$scope.searchString][value] = [];
                    });
                }
                angular.forEach(topics, function(value, key) {
                    if (value.title != null && value.title.toLowerCase().indexOf($scope.searchString.toLowerCase()) > -1) {
                        $scope.searchResults[$scope.searchString][value.status].push(value);
                    }
                });
            }
            $scope.topicListCount = res.data.data.countTotal;
            $scope.rangetopicList = new Array(Math.ceil(res.data.data.countTotal / 6));
            if (topics && topics.length) {
                $scope.topicList = $scope.topicList.concat(topics);
                $scope.filters.offset += $scope.filters.limit;
                $scope.filters.infiniteScrollDisabled = false;
            }
            if (!topics || !topics.length || topics.length < $scope.filters.limit) {
                $scope.filters.infiniteScrollDisabled = true;
            }
            $scope.isTopicListLoading = false;
        }, function(res) {
            $log.log("List fetch failed or was cancelled", res);
            $scope.isTopicListLoading = false;
        });
    };
    var loadFollowUpTopicListPromise = null;
    $scope.loadFollowUpList = function() {
        // Disable infiniteScroll loading whyle fetching new data
        $scope.isTopicListLoading = true;
        if (loadFollowUpTopicListPromise) {
            loadFollowUpTopicListPromise.abort();
        }
        var offset = $scope.filters.followUp_offset;
        if (offset > 0) {
            offset = offset - 1;
        }
        loadFollowUpTopicListPromise = sTopic.listUnauth("followUp", $scope.filters.categories.value, offset, $scope.filters.limit);

        loadFollowUpTopicListPromise.then(function(res) {
					var topics = res.data.data.rows

					topics = topics.map(function(topic) {
						return sTopic.readUnauth(topic).then(function(res) {
							return res.data.data
						})
					})

					topics = topics.map(function(topic) {
						return topic.then(function(topic) {
							var vote = sTopic.voteReadUnauth(topic.id, topic.vote.id)

							return vote.then(function(res) {
								topic.vote = res.data.data
								topic.vote.yesindex = getYesIndex(topic.vote)
								return topic
							})
						})
					})

					Promise.all(topics).then(function(topics) {
						$scope.followuptopicList = topics
						$scope.filters.offset += $scope.filters.limit
						$scope.$digest()
            $scope.isTopicListLoading = false
					})

					var pages = Math.ceil(res.data.data.countTotal / $scope.filters.limit)
					$scope.rangefollowuptopicList = new Array(pages);
					$scope.followuptopicList = res.data.data.rows

        }, function(err) {
					$scope.isTopicListLoading = false;
					throw err
        });
    };

    var loadVotingTopicListPromise = null;
    $scope.loadVotingList = function() {
        // Disable infiniteScroll loading whyle fetching new data
        $scope.filters.infiniteScrollDisabled = true;
        $scope.isTopicListLoading = true;
        if (loadVotingTopicListPromise) {
            loadVotingTopicListPromise.abort();
        }
        var offset = $scope.filters.voting_offset;
        if (offset > 0) {
            offset = offset - 1;
        }
        loadvotingTopicListPromise = sTopic.listUnauth("voting", $scope.filters.categories.value, offset, $scope.filters.limit);
        loadvotingTopicListPromise.then(function(res) {
            var topics = res.data.data.rows;
            angular.forEach(topics, function(value, key) {
                sTopic.readUnauth(value).then(function(res) {
                    value = res.data.data;
                    sTopic.voteReadUnauth(value.id, value.vote.id).then(function(res) {
                        value.vote = res.data.data;
                        value.vote.yesindex = _.findIndex(value.vote.options.rows, function(o) {
                            return o.value.toLowerCase() == "yes";
                        });
                        topics[key] = value;
                        $scope.votingtopicList = [];
                        if (topics && topics.length) {
                            $scope.votingtopicList = $scope.votingtopicList.concat(topics);
                            $scope.filters.offset += $scope.filters.limit;
                            $scope.filters.infiniteScrollDisabled = false;
                        }
                    }, function() {});
                });
            });
            var pages = Math.ceil(res.data.data.countTotal / $scope.filters.limit);
            $scope.rangevotingtopicList = new Array(pages);
            $scope.votingtopicList = [];
            if (topics && topics.length) {
                $scope.votingtopicList = $scope.votingtopicList.concat(topics);
                $scope.filters.offset += $scope.filters.limit;
                $scope.filters.infiniteScrollDisabled = false;
            }
            if (!topics || !topics.length || topics.length < $scope.filters.limit) {
                $scope.filters.infiniteScrollDisabled = true;
            }
            $scope.isTopicListLoading = false;
        }, function(res) {
            $log.log("List fetch failed or was cancelled", res);
            $scope.isTopicListLoading = false;
        });
    };
    var loadDiscussionsTopicListPromise = null;
    $scope.loadDiscussionsList = function() {
        // Disable infiniteScroll loading whyle fetching new data
        $scope.filters.infiniteScrollDisabled = true;
        $scope.isTopicListLoading = true;
        if (loadDiscussionsTopicListPromise) {
            loadDiscussionsTopicListPromise.abort();
        }
        var offset = $scope.filters.discussion_offset;
        if (offset > 0) {
            offset = offset - 1;
        }
        loadDiscussionsTopicListPromise = sTopic.listUnauth("inProgress", $scope.filters.categories.value, offset, $scope.filters.limit);
        loadDiscussionsTopicListPromise.then(function(res) {
            var topics = res.data.data.rows;
            angular.forEach(topics, function(value, key) {
                value.numberOfDaysLeft = $scope.dateDiff(new Date(), value.endsAt);
                topics[key] = value;
            });
            var pages = Math.ceil(res.data.data.countTotal / $scope.filters.limit);
            $scope.rangediscussiontopicList = new Array(pages);
            $scope.discussiontopicList = [];
            if (topics && topics.length) {
                $scope.discussiontopicList = $scope.discussiontopicList.concat(topics);
                $scope.filters.offset += $scope.filters.limit;
                $scope.filters.infiniteScrollDisabled = false;
            }
            if (!topics || !topics.length || topics.length < $scope.filters.limit) {
                $scope.filters.infiniteScrollDisabled = true;
            }
            $scope.isTopicListLoading = false;
        }, function(res) {
            $log.log("List fetch failed or was cancelled", res);
            $scope.isTopicListLoading = false;
        });
    };
    $scope.setPage = function(filter, page) {
        switch (filter) {
          case "inProgress":
            //   $scope.discussiontopicList = [];
            if ($scope.searchString != null && $scope.searchString != "") {
                var topics = $scope.searchResults[$scope.searchString]["inProgress"];
                $scope.rangediscussiontopicList = new Array(Math.ceil(topics.length / $scope.filters.limit));
                topics = topics.slice(page * $scope.filters.limit, page * $scope.filters.limit + $scope.filters.limit);
                $scope.discussiontopicList = [];
                if (topics && topics.length) {
                    $scope.discussiontopicList = $scope.discussiontopicList.concat(topics);
                    $scope.filters.discussion_offset = page * $scope.filters.limit;
                    $scope.filters.infiniteScrollDisabled = false;
                }
            } else {
                $scope.filters.discussion_offset = page * $scope.filters.limit;
                $scope.loadDiscussionsList();
            }
            break;

          case "voting":
            if (!($scope.searchString == null || $scope.searchString == "")) {
                var topics = $scope.searchResults[$scope.searchString]["voting"];
                $scope.rangevotingtopicList = new Array(Math.ceil(topics.length / $scope.filters.limit));
                topics = topics.slice(page * $scope.filters.limit, page * $scope.filters.limit + $scope.filters.limit);
                $scope.votingtopicList = [];
                if (topics && topics.length) {
                    $scope.votingtopicList = $scope.votingtopicList.concat(topics);
                    $scope.filters.voting_offset = page * $scope.filters.limit;
                    $scope.filters.infiniteScrollDisabled = false;
                }
            } else {
                $scope.filters.voting_offset = page * $scope.filters.limit;
                $scope.loadVotingList();
            }
            break;

          case "followUp":
            if ($scope.searchString == null || $scope.searchString == "") {
                var topics = $scope.searchResults[$scope.searchString]["followUp"];
                $scope.rangefollowuptopicList = new Array(Math.ceil(topics.length / $scope.filters.limit));
                topics = topics.slice(page * $scope.filters.limit, page * $scope.filters.limit + $scope.filters.limit);
                $scope.followuptopicList = [];
                if (topics && topics.length) {
                    $scope.followuptopicList = $scope.followuptopicList.concat(topics);
                    $scope.filters.followUp_offset = page * $scope.filters.limit;
                    $scope.filters.infiniteScrollDisabled = false;
                }
            } else {
                $scope.filters.followUp_offset = page * $scope.filters.limit;
                $scope.loadFollowUpList();
            }
            break;
        }
    };
    /// searchHack
    $scope.searchTopics = function() {
        if ($scope.searchString == null || $scope.searchString == "") {
            $scope.loadFollowUpList();
            $scope.loadDiscussionsList();
            $scope.loadVotingList();
        } else {
            if (!$scope.searchResults[$scope.searchString]) {
                $scope.loadTopicList();
            }
            var loaderwatcher = $scope.$watch("isTopicListLoading", function(oldValue, newValue) {
                if (!$scope.isTopicListLoading) {
                    angular.forEach(sTopic.STATUSES, function(value, key) {
                        switch (value) {
                          case "inProgress":
                            var topics = $scope.searchResults[$scope.searchString]["inProgress"];
                            $scope.rangediscussiontopicList = new Array(Math.ceil(topics.length / $scope.filters.limit));
                            topics = topics.slice(0, $scope.filters.limit);
                            $scope.discussiontopicList = [];
                            if (topics && topics.length) {
                                $scope.discussiontopicList = $scope.discussiontopicList.concat(topics);
                                $scope.filters.discussion_offset = 0 * $scope.filters.limit;
                                $scope.filters.infiniteScrollDisabled = false;
                            }
                            break;

                          case "voting":
                            var topics = $scope.searchResults[$scope.searchString]["voting"];
                            $scope.rangevotingtopicList = new Array(Math.ceil(topics.length / $scope.filters.limit));
                            topics = topics.slice(0, $scope.filters.limit);
                            $scope.votingtopicList = [];
                            if (topics && topics.length) {
                                $scope.votingtopicList = $scope.votingtopicList.concat(topics);
                                $scope.filters.voting_offset = 0 * $scope.filters.limit;
                                $scope.filters.infiniteScrollDisabled = false;
                            }
                            break;

                          case "followUp":
                            var topics = $scope.searchResults[$scope.searchString]["followUp"];
                            $scope.rangefollowuptopicList = new Array(Math.ceil(topics.length / $scope.filters.limit));
                            topics = topics.slice(0, $scope.filters.limit);
                            $scope.followuptopicList = [];
                            if (topics && topics.length) {
                                $scope.followuptopicList = $scope.followuptopicList.concat(topics);
                                $scope.filters.followUp_offset = 0 * $scope.filters.limit;
                                $scope.filters.infiniteScrollDisabled = false;
                            }
                            break;
                        }
                    });
                    loaderwatcher();
                }
            });
        }
    };
    //////
    // $scope.loadTopicList();
    $scope.loadFollowUpList();
    $scope.loadDiscussionsList();
    $scope.loadVotingList();
    $scope.getCategoryTheme = function(category) {
        var theme = CATEGORY_THEME[category];
        return theme ? theme : CATEGORY_THEME.varia;
    };
    $scope.hideDisclaimer = function() {
        $scope.isDisclaimerHidden = true;
        toruSessionSettings.set(SETTINGS_DISCLAIMER_KEY, true);
    };
    $scope.watchvideo = function() {
        ngDialog.open({
            template: "/templates/modals/home_video.html",
            scope: $scope
        });
    };
} ]);

function getYesIndex(vote) {
	for (var i = 0; i < vote.options.rows.length; ++i) {
		if (vote.options.rows[i].value.toLowerCase() === "yes") return i
	}

	return null
}
