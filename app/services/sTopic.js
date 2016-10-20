var Config = require("root/config")

app.service("sTopic", [ "$http", "$q", "$log", function($http, $q, $log) {
	var Topic = this;
	Topic.LEVELS = {
		none: "none",
		read: "read",
		edit: "edit",
		admin: "admin"
	};
	Topic.STATUSES = {
		inProgress: "inProgress",
		// Being worked on
		voting: "voting",
		// Is being voted which means the Topic is locked and cannot be edited.
		followUp: "followUp",
		// Done editing Topic and executing on the follow up plan.
		closed: "closed"
	};
	// Statuses in which Topic editing is disabled. No changes can be made to title or text.
	Topic.STATUSES_DISABLED = [ Topic.STATUSES.voting, Topic.STATUSES.followUp, Topic.STATUSES.closed ];
	Topic.VISIBILITY = {
		"public": "public",
		// Everyone has read-only on the Topic.  Pops up in the searches..
		"private": "private"
	};

	Topic.VOTE_TYPES = {
		regular: "regular",
		multiple: "multiple"
	};
	Topic.VOTE_AUTH_TYPES = {
		soft: "soft",
		hard: "hard"
	};
	Topic.COMMENT_TYPES = {
		pro: "pro",
		con: "con",
		reply: "reply"
	};
	Topic.COMMENT_ORDER_BY = {
		rating: "rating",
		popularity: "popularity",
		date: "date"
	};

	Topic.create = function(topic) {
		return $http.post("/api/users/self/topics", topic);
	};

	//TODO: What was I thinking? This interface is funky, it should have 1 input topicId
	Topic.read = function(topic) {
		var path = "/api/users/self/topics/:topicId".replace(":topicId", topic.id);
		return $http.get(path);
	};
	//TODO: What was I thinking? This interface is funky, it should have 1 input topicId
	Topic.readUnauth = function(topic) {
		var path = "/api/topics/:topicId".replace(":topicId", topic.id);
		return $http.get(path);
	};
	//TODO: This interface is funky, it should have 1 input topicId and second data
	Topic.update = function(topic) {
		var path = "/api/users/self/topics/:topicId".replace(":topicId", topic.id);
		return $http.put(path, topic);
	};
	Topic.setTokenJoin = function(topicId) {
		var path = "/api/users/self/topics/:topicId/tokenJoin".replace(":topicId", topicId);
		return $http.put(path);
	};
	Topic.setEndsAt = function (topic, endsAt) {
		return Topic.update({id: topic.id, endsAt: endsAt});
	};
	Topic.delete = function(topicId) {
		var path = "/api/users/self/topics/:topicId".replace(":topicId", topicId);
		return $http.delete(path);
	};
	Topic.list = function() {
		var path = "/api/users/self/topics";
		return $http.get(path);
	};
	Topic.listUnauth = function(statuses, offset, limit) {
		return function() {
			var path = "/api/topics";
			var deferredAbort = $q.defer();
			var promise = $http.get(path, {
				params: {
					statuses: statuses,
					offset: offset,
					limit: limit,
					sourcePartnerId: Config.CLIENT_ID
				},
				timeout: deferredAbort.promise
			});
			// Abort the request
			promise.abort = function() {
				deferredAbort.resolve();
			};
			// Cleanup
			promise.finally(function() {
				promise.abort = angular.noop;
				deferredAbort = request = promise = null;
			});
			return promise;
		}();
	};
	Topic.membersList = function(topicId) {
		var path = "/api/users/self/topics/:topicId/members".replace(":topicId", topicId);
		return $http.get(path);
	};
	Topic.memberUsersCreate = function(topicId, members) {
		var path = "/api/users/self/topics/:topicId/members/users".replace(":topicId", topicId);
		return $http.post(path, members);
	};
	Topic.memberUserUpdate = function(topicId, userId, level) {
		var path = "/api/users/self/topics/:topicId/members/users/:memberId".replace(":topicId", topicId).replace(":memberId", userId);
		return $http.put(path, {
			level: level
		});
	};
	Topic.memberUserDelete = function(topicId, userId) {
		var path = "/api/users/self/topics/:topicId/members/users/:memberId".replace(":topicId", topicId).replace(":memberId", userId);
		return $http.delete(path);
	};
	Topic.memberGroupsCreate = function(topicId, members) {
		var path = "/api/users/self/topics/:topicId/members/groups".replace(":topicId", topicId);
		return $http.post(path, members);
	};
	Topic.memberGroupsUpdate = function(topicId, groupId, level) {
		var path = "/api/users/self/topics/:topicId/members/groups/:memberId".replace(":topicId", topicId).replace(":memberId", groupId);
		return $http.put(path, {
			level: level
		});
	};
	Topic.memberGroupsDelete = function(topicId, groupId) {
		var path = "/api/users/self/topics/:topicId/members/groups/:memberId".replace(":topicId", topicId).replace(":memberId", groupId);
		return $http.delete(path);
	};
	Topic.commentCreate = function(topicId, parentId, type, subject, text) {
		var path = "/api/users/self/topics/:topicId/comments".replace(":topicId", topicId);
		var data = {
			parentId: parentId,
			type: type,
			subject: subject,
			text: text
		};
		return $http.post(path, data);
	};
	Topic.commentVoteCreate = function(topicId, commentId, value) {
		var path = "/api/topics/:topicId/comments/:commentId/votes".replace(":topicId", topicId).replace(":commentId", commentId);
		var data = {
			value: value
		};
		return $http.post(path, data);
	};
	Topic.join = function(tokenJoin) {
		var path = "/api/topics/join/:tokenJoin".replace(":tokenJoin", tokenJoin);
		return $http.post(path);
	};
	Topic.commentList = function(topicId, orderBy) {
		var path = "/api/users/self/topics/:topicId/comments".replace(":topicId", topicId);
		return $http.get(path, {
			params: {
				orderBy: orderBy || Topic.COMMENT_ORDER_BY.date
			}
		});
	};
	Topic.commentListUnauth = function(topicId, orderBy) {
		var path = "/api/topics/:topicId/comments".replace(":topicId", topicId);
		return $http.get(path, {
			params: {
				orderBy: orderBy || Topic.COMMENT_ORDER_BY.date
			}
		});
	};
	Topic.commentDelete = function(topicId, commentId) {
		var path = "/api/users/self/topics/:topicId/comments/:commentId".replace(":topicId", topicId).replace(":commentId", commentId);
		return $http.delete(path);
	};
	Topic.voteCreate = function(topicId, options, minChoices, maxChoices, delegationIsAllowed, endsAt, description, type, authType) {
		var path = "/api/users/self/topics/:topicId/votes".replace(":topicId", topicId);
		var data = {
			options: options,
			minChoices: minChoices,
			maxChoices: maxChoices,
			delegationIsAllowed: delegationIsAllowed,
			endsAt: endsAt,
			description: description,
			type: type,
			authType: authType
		};
		return $http.post(path, data);
	};
	Topic.voteUpdate = function(topicId, voteId, endsAt) {
		var path = "/api/users/self/topics/:topicId/votes/:voteId".replace(":topicId", topicId).replace(":voteId",voteId);
		var data = {
			endsAt: endsAt
		};
		return $http.put(path, data);
	};
	Topic.voteRead = function(topicId, voteId) {
		var path = "/api/users/self/topics/:topicId/votes/:voteId".replace(":topicId", topicId).replace(":voteId", voteId);
		return $http.get(path);
	};
	Topic.voteReadUnauth = function(topicId, voteId) {
		var path = "/api/topics/:topicId/votes/:voteId".replace(":topicId", topicId).replace(":voteId", voteId);
		return $http.get(path);
	};
	Topic.voteVote = function(topicId, voteId, voteList, certificate, pid, phoneNumber) {
		var path = "/api/users/self/topics/:topicId/votes/:voteId".replace(":topicId", topicId).replace(":voteId", voteId);
		var data = {
			options: voteList,
			certificate: certificate,
			pid: pid,
			phoneNumber: phoneNumber
		};
		return $http.post(path, data);
	};
	Topic.voteVoteUnauth = function (topicId, voteId, voteList, certificate, pid, phoneNumber) {
		var path = '/api/topics/:topicId/votes/:voteId'
			.replace(':topicId', topicId)
			.replace(':voteId', voteId);

		var data = {
			options: voteList,
			certificate: certificate,
			pid: pid,
			phoneNumber: phoneNumber
		};
		return $http.post(path, data);
	};
	Topic.voteVoteSign = function (topicId, voteId, signatureValue, token) {
		var path = '/api/users/self/topics/:topicId/votes/:voteId/sign'
			.replace(':topicId', topicId)
			.replace(':voteId', voteId);

		var data = {
			signatureValue: signatureValue,
			token: token
		};

		return $http.post(path, data);
	};

	Topic.voteVoteStatus = function (topicId, voteId, token) {
		var path = '/api/users/self/topics/:topicId/votes/:voteId/status?token=:token'.replace(":topicId", topicId).replace(":voteId", voteId).replace(':token', token);
		return $http.get(path);
	};

	Topic.voteVoteStatusUnauth = function (topicId, voteId, token) {
		var path = '/api/topics/:topicId/votes/:voteId/status?token=:token'
			.replace(':topicId', topicId)
			.replace(':voteId', voteId)
			.replace(':token', token);

		return $http.get(path);
	};
	Topic.voteDelegationCreate = function(topicId, voteId, toUserId) {
		var path = "/api/users/self/topics/:topicId/votes/:voteId/delegations".replace(":topicId", topicId).replace(":voteId", voteId);
		return $http.post(path, {
			userId: toUserId
		});
	};
	Topic.voteVoteSignUnauth = function (topicId, voteId, signatureValue, token) {
		var path = '/api/topics/:topicId/votes/:voteId/sign'
			.replace(':topicId', topicId)
			.replace(':voteId', voteId);

		var data = {
			signatureValue: signatureValue,
			token: token
		};

		return $http.post(path, data);
	};
	Topic.voteDelegationDelete = function(topicId, voteId) {
		var path = "/api/users/self/topics/:topicId/votes/:voteId/delegations".replace(":topicId", topicId).replace(":voteId", voteId);
		return $http.delete(path);
	};
	Topic.isStatusDisabled = function(status) {
		if (!status || !Topic.STATUSES[status]) throw Error("Invalid status", status);
		return Topic.STATUSES_DISABLED.indexOf(status) > -1;
	};
	Topic.eventsList = function(topicId) {
		var path = "/api/topics/:topicId/events".replace(":topicId", topicId);
		return $http.get(path).then(function(response) {
			return response.data.data.rows;
		});
	};
	Topic.eventCreate = function(topicId, eventData, authToken) {
		var path, headers

		// Currently an external or anonymous token requires the endpoint to be
		// separate from when the token is of the user. This will hopefully be
		// unified so endpoints are not dependent on token sources.
		if (authToken) {
			path = "/api/topics/:topicId/events"
			headers = {Authorization: "Bearer "+ authToken}
		}
		else {
			path = "/api/users/self/topics/:topicId/events"
		}

		path = path.replace(":topicId", topicId)

		return $http({
			url: path,
			method: 'POST',
			data: eventData,
			headers: headers
		}).then(function(response) {
			return response.data.data
		})
	};
} ]);
