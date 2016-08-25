"use strict";

app.controller("AppCtrl", [ "$scope", "$rootScope", "$window", "$state", "$translate", "$log", "hotkeys", "amMoment", "UserVoice", "ngDialog", "toruConfig", "toruSessionSettings", "sAuth", "sUser", "CitizenOSOpenId", "$sce", function($scope, $rootScope, $window, $state, $translate, $log, hotkeys, amMoment, UserVoice, ngDialog, toruConfig, toruSessionSettings, sAuth, sUser, CitizenOSOpenId, $sce) {
    $scope.app = {
        config: toruConfig
    };
    $scope.$sce = $sce
    $scope.Config = window.Config
    $scope.app.finalizeOpen = null;
    $scope.citizenosLogin=false;
    $scope.app.user = sAuth.user;
    // When $translate provides getAvailableLanguages, this will be used instead
    $scope.app.language = toruConfig.language.default;
    $scope.app.languagesAvailable = toruConfig.language.list;
    $scope.app.notifications = {
        info: null,
        error: null
    };
    $scope.app.login = function () {
        CitizenOSOpenId.authorize({},$scope.app.language);
    };
    $scope.app.isLoggedIn = function () {
        return $scope.app.user && $scope.app.user.loggedIn;
    };
    $scope.app.logout = function () {
        CitizenOSOpenId.unauthorize();
        $window.location.href = '/';
    };
    // Check current login status
    sAuth.status();
    $scope.showCitizenOSLogin = function(){
        if($scope.citizenosLogin == true){
            $scope.citizenosLogin = false;
        }else{
            $scope.citizenosLogin = true;
        }
    }
    $scope.app.showInfo = function(messages) {
        if (!Array.isArray(messages)) {
            messages = [ messages ];
        }
        $scope.app.notifications.info = messages;
    };
    $scope.app.showError = function(messages) {
        if (!Array.isArray(messages)) {
            messages = [ messages ];
        }
        $scope.app.notifications.error = messages;
    };
    $scope.app.hideInfo = function() {
        $scope.app.notifications.info = null;
    };
    $scope.app.hideError = function() {
        $scope.app.notifications.error = null;
    };
    $scope.app.setLanguage = function(language) {
        $log.info("Language change from", $scope.app.language, "to", language);
        if (language === $scope.app.language) return;
        $translate.use(language);
    };
    // Watch for User to be loaded, use profile language
    $scope.$watch(function() {
        return $scope.app.user.language;
    }, function(newVal, oldVal) {
        if (newVal && newVal !== oldVal && newVal !== $scope.app.language) {
            $scope.app.setLanguage(newVal);
        }
    });
    $rootScope.$on("$stateChangeSuccess", function() {
        $scope.app.hideError();
        $scope.app.hideInfo();
    });
    $rootScope.$on("ngDialog.opened", function(e, $dialog) {
        $scope.app.hideError();
        $scope.app.hideInfo();
    });
    $scope.app.dashboard = function() {
        if ($scope.app.user.loggedIn) {
            ngDialog.open({
                template: "/templates/modals/dashboard.html",
                scope: $scope
            });
        }
    };
    $scope.app.editProfile = function() {

        if ($scope.app.user.loggedIn) {
            ngDialog.closeAll();
            setTimeout(function(){
                ngDialog.open({
                    template: "/templates/modals/profileEdit.html",
                    scope: $scope
                });
                $('.pp-layer').show();},400);

        }
    };
    $scope.finalize = function() {
        if($scope.app.finalizeOpen == true){
            console.log("finalizer");
            $("#reg").html("");
            console.log("finalize");
            ngDialog.open({
                template: "/templates/modals/finalize.html",
                appendTo: "#reg",
                scope: $scope
            });
        }
    };
    $scope.dearUser = function() {
            console.log("dearUser");
            $("#reg").html("");
            console.log("dearUser");
            ngDialog.open({
                template: "/templates/modals/dear_user.html",
                scope: $scope
            });
    };
    $rootScope.$on("user.change", function(event, data) {
        sAuth.status();
    });
    $rootScope.$on("$translateChangeSuccess", function(evt, data) {
        $scope.app.language = data.language;
        amMoment.changeLocale($scope.app.language);
        UserVoice.push([ "set", "locale", $scope.app.language ]);
        if (data.language === toruConfig.language.debug) return;
        $log.info("$translatechangeSuccess", data.language);
        // Update User language in the profile
        if ($scope.app.user.loggedIn) {
            var newLanguage = data.language;
            if (newLanguage) {
                sUser.updateLanguage(data.language).then(function() {
                    $scope.app.user.language = data.language;
                });
            }
        }
    });
    hotkeys.add({
        combo: "ctrl+shift+alt+t",
        description: "Toggle translation debug mode.",
        callback: function() {
            // Already in debug mode
            if ($translate.use() === toruConfig.language.debug) {
                var newLanguage = $scope.app.user.loggedIn ? $scope.app.user.language : toruConfig.language.default;
                $log.log("Translation debug OFF", newLanguage);
                $scope.app.setLanguage(newLanguage);
            } else {
                $log.log("Translation debug ON", $scope.app.language);
                $scope.app.setLanguage(toruConfig.language.debug);
            }
        }
    });
    // Update UserVoice data when User changes
    $scope.$watch(function() {
        return $scope.app.user.loggedIn;
    }, function(loggedIn) {
        if (loggedIn) {
            console.log($scope.app.user.email);
            if ($scope.app.user.email== null) {
                $scope.finalize();
            }else{
                $scope.app.finalizeOpen=false;
            }
            UserVoice.push([ "identify", {
                email: $scope.app.user.email,
                id: $scope.app.user.id,
                name: $scope.app.user.name
            } ]);
        }
    });

    // Set up UserVoice - https://developer.uservoice.com/docs/widgets/options/
    // TODO: Ideally this should be in provider.config...
    UserVoice.push([ "set", {
        accent_color: "#808283",
        trigger_color: "white",
        trigger_background_color: "rgba(46, 49, 51, 0.6)"
    } ]);
    UserVoice.push([ "addTrigger", {
        mode: "contact",
        trigger_position: "bottom-right"
    } ]);
    $rootScope.$on("$stateChangeStart", function(event, toState, toParams, fromState, fromParams) {
        $log.debug("AppCtrl $stateChangeStart to:", toState, toParams, "from:", fromState, fromParams);
    });
    checkCookie = function(){
        var dearUserCookie=getCookie("dearuser");

        // The beta warning used to be a permanent cookie, but then desired to
        // be a session cookie. Overwriting it whether it exists or not changes
        // the permantent cookie to a session one.
        document.cookie="dearuser=dearuser;";

        if (!dearUserCookie) $scope.dearUser()
    };
    checkCookie();
    function getCookie(cname) {
        var name = cname + "=";
        var ca = document.cookie.split(';');
        for(var i=0; i<ca.length; i++) {
            var c = ca[i];
            while (c.charAt(0)==' ') c = c.substring(1);
            if (c.indexOf(name) == 0) return c.substring(name.length,c.length);
        }
        return "";
    }
} ]);
