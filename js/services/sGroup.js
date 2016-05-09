"use strict";

app.service("sGroup", [ "$http", function($http) {
    var Group = this;
    Group.LEVELS = {
        read: "read",
        admin: "admin"
    };
    Group.create = function(name) {
        var path = "/api/users/self/groups";
        return $http.post(path, {
            name: name
        });
    };
    Group.read = function(groupId) {
        var path = "/api/users/self/groups/:groupId".replace(":groupId", groupId);
        return $http.get(path);
    };
    Group.update = function(groupId, name) {
        var path = "/api/users/self/groups/:groupId".replace(":groupId", groupId);
        return $http.put(path, {
            name: name
        });
    };
    Group.delete = function(groupId) {
        var path = "/api/users/self/groups/:groupId".replace(":groupId", groupId);
        return $http.delete(path);
    };
    Group.list = function() {
        var path = "/api/users/self/groups";
        return $http.get(path);
    };
    Group.membersCreate = function(groupId, members) {
        var path = "/api/users/self/groups/:groupId/members".replace(":groupId", groupId);
        return $http.post(path, members);
    };
    Group.memberUpdate = function(groupId, memberId, level) {
        var path = "/api/users/self/groups/:groupId/members/:memberId".replace(":groupId", groupId).replace(":memberId", memberId);
        return $http.put(path, {
            level: level
        });
    };
    Group.memberDelete = function(groupId, memberId) {
        var path = "/api/users/self/groups/:groupId/members/:memberId".replace(":groupId", groupId).replace(":memberId", memberId);
        return $http.delete(path);
    };
    Group.membersList = function(groupId) {
        var path = "/api/users/self/groups/:groupId/members".replace(":groupId", groupId);
        return $http.get(path);
    };
    Group.topicsList = function(groupId) {
        var path = "/api/users/self/groups/:groupId/topics".replace(":groupId", groupId);
        return $http.get(path);
    };
} ]);