'use strict';

/* jasmine specs for controllers go here */
    describe('Topic state', function() {

  var $rootScope, $state, $injector, myServiceMock, $browser, state = 'topics.view';

  beforeEach(function() {

    module('app', function($provide) {
      $provide.value('myService', myServiceMock = {});
    });

    inject(function(_$rootScope_, _$state_, _$injector_, $templateCache, _$browser_) {
      $rootScope = _$rootScope_;
      $state = _$state_;
      $injector = _$injector_;
      $browser = _$browser_;
      // We need add the template entry into the templateCache if we ever
      // specify a templateUrl
      $templateCache.put('topic.html', '');
    })
  });

  it('should respond to URL', function() {
    expect($state.href(state, { id: "5282aaa5-46f5-476c-ac9a-a0cacc3a59cc" })).toEqual('/topics/5282aaa5-46f5-476c-ac9a-a0cacc3a59cc');
  });

  it('should resolve data', function() {
    myServiceMock.findAll = jasmine.createSpy('findAll').andReturn('findAll');

    $state.go(state,{
        id: "5282aaa5-46f5-476c-ac9a-a0cacc3a59cc"
    });
    $rootScope.$digest();
    expect($state.current.name).toBe(state);
  });
});   
   