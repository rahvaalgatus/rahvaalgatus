"use strict";

app.controller("TopicVoteCreateFormCtrl", [ "$scope", "$rootScope", "$state", "$log", "$q", "moment", "sTopic", function($scope, $rootScope, $state, $log, $q, moment, sTopic) {
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
				options: angular.copy(CONF.defaultOptions.regular),
				extraOptions: [],
				delegationIsAllowed: false,
				endsAt: new Date(),
				showCalendar: true,
				voteType: $scope.voteTypes.regular,
				authType: $scope.voteAuthTypes.hard,
				numberOfDaysLeft: 0
		};
		$scope.isRegularVote = function() {
				return $scope.form.voteType === $scope.voteTypes.regular;
		};
		$scope.isAuthTypeHard = function() {
				return $scope.form.authType === $scope.voteAuthTypes.hard;
		};
		$scope.setVoteType = function(voteType) {
				if (voteType == $scope.voteTypes.multiple) {
						$scope.form.voteType = voteType;
						$scope.form.options = angular.copy(CONF.defaultOptions.multiple);
				} else {
						$scope.form.voteType = $scope.voteTypes.regular;
						$scope.form.options = angular.copy(CONF.defaultOptions.regular);
				}
		};
		$scope.optionAdd = function() {
				if ($scope.isOptionAddAllowed()) {
						// Allow maximum 10 options
						$scope.form.options.push({
								name: null
						});
				}
		};
		$scope.optionDelete = function(index) {
				if ($scope.isOptionDeleteAllowed()) {
						// Require at least 2 options
						$scope.form.options.splice(index, 1);
				}
		};
		$scope.isOptionAddAllowed = function() {
				return $scope.form.options.length < CONF.optionsMax;
		};
		$scope.isOptionDeleteAllowed = function() {
				return $scope.form.options.length > CONF.optionsMin;
		};
		$scope.$watch("form.authType", function(newValue, oldValue) {
				if (newValue === oldValue) return;
				if (newValue) {
						$scope.form.delegationIsAllowed = false;
				}
		});
		$scope.$watch("form.endsAt", function(newValue, oldValue) {
				if (!newValue) return;
				newValue = new Date(newValue);
				var diffTime = newValue.getTime() - new Date().getTime();
				$scope.form.numberOfDaysLeft = Math.ceil(diffTime / (1e3 * 3600 * 24));
				var testtime =	(moment(new Date()).add(1, "y").toDate().getTime() - new Date().getTime());
				var numberdays = Math.ceil(testtime / (1e3 * 3600 * 24));
				if($scope.form.numberOfDaysLeft > numberdays){
						$scope.form.endsAt = moment(new Date()).add(1, "y").toDate();
				}

		});
		$scope.save = function() {
				var options = angular.copy($scope.form.options);
				/*for (var o in $scope.form.extraOptions) {
						var option = $scope.form.extraOptions[o];
						if (option.enabled) {
								options.push({
										value: option.value
								});
						}
				}*/
				if (!$scope.form.showCalendar) {
						// There must be a more elegant solution..
						$scope.form.endsAt = null;
				}

				var endsAt = new Date($scope.form.endsAt)
				endsAt.setHours(23, 59, 59, 999)

				sTopic.voteCreate($scope.topic.id, options, null, null, $scope.form.delegationIsAllowed, endsAt, null, $scope.form.voteType, $scope.form.authType).then(function(res) {
						var vote = res.data.data;
						$scope.topic.endsAt = new Date();
						sTopic.setEndsAt($scope.topic, new Date());
						$log.debug("Vote creation succeeded", res, vote);
						$state.go("topics.vote", {id: $scope.topic.id}, {reload: true})
				}, function(res) {
						$log.error("Vote creation failed", res);
						if (res.status === 400 && res.data.errors) {
								$scope.app.showError(_.values(res.data.errors));
						}
				});
		};
} ]);
