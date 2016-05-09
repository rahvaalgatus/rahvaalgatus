'use strict';

/* jasmine specs for controllers go here */
describe('Rahvaalgatus', function() {
    describe('HomeCtrl',function(){
        beforeEach(module('app'));

        var $controller;

        beforeEach(inject(function(_$controller_){
          // The injector unwraps the underscores (_) from around the parameter names when matching
          $controller = _$controller_;
        }));
        describe('dateDiff', function() {
          it('should return difference between days', function() {
            var $scope = {};
            var controller = $controller('HomeCtrl', { $scope: $scope });
            var dates = [["2015-03-25","2015-03-26"],["2015-03-25","2015-03-27"],["2015-03-25","2015-03-28"],["2016-01-25"]];
            var results = [1,2,3,4];
            for(var i=0;i<dates.length;i++){
                expect($scope.dateDiff(dates[i][0],dates[i][1])).toEqual(results[i]);
            }

          });
        });
        describe('loadTopicList', function() {
          it('should loadTopicList without searchparams', function() {
            var $scope = {};
            var controller = $controller('HomeCtrl', { $scope: $scope });
            $scope.loadTopicList();
            setTimeout(function(){
                expect($scope.topicList.length).toBeGreaterThan(6);
            },2000);
            
          });
        });        
    });    

});
