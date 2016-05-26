"use strict";

app.controller("EventsCtrl", ["$scope", "sTopic", "sAuth", function($scope, sTopic, sAuth) {
  $scope.events = {
    status: null,
    list:   []
  };

  $scope.$watch("topic.id", function(topicId) {
    if (topicId && $scope.events.status === null) {
      loadEvents(topicId);
    }
  });

  function loadEvents(topicId) {
    $scope.events.status = 'loading';

    sTopic.eventsList(topicId).then(function(response) {
      $scope.events.status = 'loaded';
      $scope.events.list = response.data.data.rows;
    }, function(error) {
      $scope.events.status = 'failed';
    });
  }
}]);
