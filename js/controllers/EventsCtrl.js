var app = window.app

app.controller("EventsCtrl", ["$scope", "$controller", "$state", "$location", "ngDialog", "sTopic", function($scope, $controller, $state, $location, ngDialog, sTopic) {
	$controller("TopicCtrl", {$scope: $scope})

  var authToken = $location.search().token;

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
        $scope.savingError = error.data.status.message;
      })
      .finally(function() {
        $scope.savingEvent = false;
      });
  };

  if ($state.current.url === "/create") $scope.openNewEntryDialog()
}]);
