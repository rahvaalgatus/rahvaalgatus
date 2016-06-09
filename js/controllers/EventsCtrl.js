"use strict";

app.controller("EventsCtrl", ["$scope", "$rootScope", "$state", "$location", "ngDialog", "sTopic", function($scope, $rootScope, $state, $location, ngDialog, sTopic) {
  // inherits $scope.topicEvents from TopicCtrl

  var authToken = $location.search().token;

  $rootScope.onEventsPage = true;
  $scope.$on("$destroy", function() {
    $rootScope.onEventsPage = false;
  });

  $scope.openNewEntryDialog = function() {
    $scope.event = {
      subject: "",
      text: ""
    };

    ngDialog.open({
      template: "/templates/modals/topicEventsCreate.html",
      scope: $scope,
      closeByEscape: false,
      closeByDocument: false
    });
  };

  $scope.postEvent = function() {
    $scope.savingEvent = true;

    sTopic.eventCreate($scope.topic.id, $scope.event, authToken)
      .then(function(event) {
        $scope.topicEvents.list.push(event);
        $state.go('^');
      })
      .catch(function(error) {
        console.log("failed", error);
        $scope.savingError = error.data.status.message;
      })
      .finally(function() {
        $scope.savingEvent = false;
      });
  };

  if ($state.current.url === "/create") {
    $scope.openNewEntryDialog();
  }
}]);
