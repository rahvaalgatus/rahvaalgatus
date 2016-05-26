"use strict";

app.controller("EventsCtrl", ["$scope", "$state", "ngDialog", "sTopic", function($scope, $state, ngDialog, sTopic) {
  $scope.events = {
    status: null,
    list:   []
  };

  $scope.$watch("topic.id", function(topicId) {
    if (topicId && $scope.events.status === null) {
      loadEvents(topicId);
    }
  });

  $scope.openNewEntryDialog = function() {
    console.log("opening the dialog");
    ngDialog.open({
      template: "/templates/modals/topicEventsCreate.html"
    });
  };

  console.log("state", $state);
  if ($state.current.url === "/create") {
    $scope.openNewEntryDialog();
  }

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
