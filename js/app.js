"use strict";

/**
 *  Angular App 
 *
 *  @see https://angularjs.org/
 */
var app = angular.module("app", [ "ui.router", "pascalprecht.translate", "angularMoment", "ngKookies", "ngSanitize", "ngDialog", "typeahead", "datePicker", "cfp.hotkeys", "infinite-scroll", "monospaced.elastic", "monospaced.qrcode", "ng.shims.placeholder", "angulartics", "angulartics.google.analytics", "angularHwcrypto", "toruSelect", "toruSessionSettings", "toruUtils", "toruUserVoice", "toruEtherpad","ngCookies", "angular-storage", "CitizenOS", "djds4rce.angular-socialshare" ]);

app.factory("apiUrl", function() {
    return {
        request: function(config) {
            if (config.url.indexOf("api/") > -1 && config.url.indexOf("id.citizenos") == -1) {
               config.url = "https://citizenos.com" + config.url;
            } 
            return config;
        }
    };
});

app.constant("toruConfig", {
    language: {
        "default": "et",
        list: {
            et: "Eesti",
            en: "English",
            ru: "Pусский"
        },
        debug: "dbg"
    },
    links: {
        help: {
            en: "http://citizenos.uservoice.com/knowledgebase/articles/741585",
            et: "http://citizenos.uservoice.com/knowledgebase/articles/741582",
            ru: "http://citizenos.uservoice.com/knowledgebase/articles/741798"
        },
        downloads: {
            bdocs: {
                final: "/api/users/:userId/topics/:topicId/votes/:voteId/downloads/bdocs/final" // TODO: Get rid of this, API to return absolute download url for Vote!
            }
        }
    }
});

app.config(function($stateProvider, $urlRouterProvider, $locationProvider, $httpProvider, $translateProvider, toruConfig, UserVoiceProvider, CitizenOSOpenIdProvider) {
    console.log("app.config toruConfig", toruConfig);
    // https://docs.angularjs.org/api/ng/provider/$locationProvider
    $locationProvider.html5Mode({
        enabled: true,
        rewriteLinks: true,
        requireBase: true
    });
    // https://github.com/angular-ui/ui-router/wiki/URL-Routing
    $urlRouterProvider.otherwise("/");
    $stateProvider.state("home", {
        url: "/",
        templateUrl: "/templates/home.html"
    }).state("account", {
        "abstract": true,
        url: "/account",
        templateUrl: "/templates/home.html"
    }).state("authCallback",{
        url:"/auth/callback",
        controller:function($scope, $location, $state, $stateParams, $window, $log, CitizenOSOpenId) {
                $log.debug('CallbackCtrl', $state, $stateParams, $location);
                $scope.result = CitizenOSOpenId.validate(); // CitizenOSOpenID service Will read all the params from the hash of the url, that is after #.
                $window.location.href="/";
            }
    }).state("account.signup", {
        url: "/signup?email&name&redirectSuccess",
        controller: function($scope, $state, $stateParams, $log, ngDialog) {
            if ($scope.app.user.loggedIn) {
                $state.go("home");
            }
            ngDialog.open({
                template: "/templates/modals/signUp.html",
                data: $stateParams,
                scope: $scope
            });
        }
    }).state("account.login", {
        url: "/login?email&redirectSuccess",
        controller: function($scope, $state) {
            if ($scope.app.user.loggedIn) {
                $state.go("home");
            }
        }
    }).state("account.passwordForgot", {
        url: "/forgot-password",
        controller: function($scope, $state, $window, ngDialog) {
            if ($scope.app.user.loggedIn) {
                $state.go("home");
            }
            var dialog = ngDialog.open({
                template: "/templates/modals/passwordForgot.html",
                scope: $scope
            });
            dialog.closePromise.then(function() {
                $state.go("home");
            });
        }
    }).state("account.passwordReset", {
        url: "/reset-password/:passwordResetCode?email",
        controller: function($scope, $state, ngDialog) {
            if ($scope.app.user.loggedIn) {
                $state.go("home");
            }
            ngDialog.open({
                template: "/templates/modals/passwordReset.html",
                scope: $scope
            });
        }
    }).state("about", {
        url: "/about",
        templateUrl: "/templates/about.html"
    }).state("support", {
        url: "/support_us",
        templateUrl: "/templates/support_us.html"
    }).state("discussions", {
        url: "/discussions",
        templateUrl: "/templates/discussions.html"
    }).state("goodpractice", {
        url: "/goodpractice",
        templateUrl: "/templates/goodpractice.html"
    }).state("votings", {
        url: "/votings",
        templateUrl: "/templates/votings.html"
    }).state("topics", {
        "abstract": true,
        url: "/topics",
        templateUrl: "/templates/topic.html"
    }).state("topics.create1", {
        // Nested states and views - https://github.com/angular-ui/ui-router/wiki/Nested-States-%26-Nested-Views
        url: "/create1",
        templateUrl: "/templates/topic.create.html"
    }).state("topics.create2", {
        // Nested states and views - https://github.com/angular-ui/ui-router/wiki/Nested-States-%26-Nested-Views
        url: "/create2/:id",
        templateUrl: "/templates/topic.create.html"
    }).state("addCoauthors", {
        // Nested states and views - https://github.com/angular-ui/ui-router/wiki/Nested-States-%26-Nested-Views
        url: "/create3/:id",
        templateUrl: "/templates/topic.addCoauthors.html"
    }).state("topics.create", {
        // Nested states and views - https://github.com/angular-ui/ui-router/wiki/Nested-States-%26-Nested-Views
        url: "/create",
        templateUrl: "/templates/topic.create.html"
    }).state("topics.view", {
        url: "/:id",
        templateUrl: "/templates/topic.view.html"
    }).state("topics.view.vote", {
        "abstract": true,
        url: "/votes",
        templateUrl: "/templates/topic.vote.html"
    }).state("topics.view.vote.create", {
        url: "/create",
        templateUrl: "/templates/topic.vote.create.html"
    }).state("topics.view.renewdeadline", {
        url: "/create",
        templateUrl: "/templates/topic.renew.deadline.html"
    }).state("topics.view.vote.view", {
        url: "/:voteId",
        templateUrl: "/templates/topic.vote.view.html"
    }).state("join", {
        // Join a Topic via shared url
        url: "/join/:tokenJoin",
        controller: "JoinCtrl"
    }).state("connections", {
        url: "/connections",
        templateUrl: "/templates/connections.html"
    }).state("groups", {
        //TODO: convert groups to nested views..
        url: "/groups",
        templateUrl: "/templates/groups.html"
    }).state("groupsEdit", {
        url: "/groups/:groupId/edit",
        templateUrl: "/templates/groups.html"
    });
    // Set up translating system
    $translateProvider.useStaticFilesLoader({
        prefix: "/languages/",
        suffix: ".json"
    });
    $translateProvider.preferredLanguage(toruConfig.language.default).registerAvailableLanguageKeys(Object.keys(toruConfig.language.list)).useSanitizeValueStrategy("escaped").useStorage("translateKookieStorage");
    UserVoiceProvider.setApiKey("X2tNuk059z6CD4Em5Q65KQ");
    
    ////
    $httpProvider.interceptors.push("apiUrl"); // Services use relative url, so we use interceptor for now to fix this :(

    CitizenOSOpenIdProvider.setConfig({
        authorizationUri: "https://citizenos.com/api/auth/openid/authorize",
        responseType: "id_token token",
        clientId: "b563ee8c-ba8e-4cd6-b592-fbcd4e8f22bb",
        redirectUri: "https://rahvaalgatus.ee/auth/callback",
        scope: "openid", // TODO: define scopes
        cookies: { // Names of the cookies used - http://openid.net/specs/openid-connect-implicit-1_0.html#rfc.section.2.1.1.1
            accessToken: "citizenos.accessToken", // Cookie name where CitizenOS OpenID access token (access_token) is stored. This is used to authorize COS requests
            nonce: "citizenos.nonce", // Cookie name where CitizenOS OpenID authorization request nonce (nonce) is stored
            state: "citizenos.state" // Cookie name where CitizenOS OpenID authorization request state (state) is stored
        },
        publicKey: "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvPEHFHwwWmSDdHYOWmi7\n+dwtjLjY7d4Dwk62hH9GBmeK/wu1xrSPk1w/suK902+Flh4P2LBWRjTfDsCsFthB\nkAYCoW1xNacGY9yaWusQz3a47skI28kY4l1hfL6UlMAY5z7loydrRLf6BlytDTqH\nGFAKilptAez+VS6bSg7g0+YoTZNELEblL6dfXIRNmUvtjpAwEYgNoJyfv5UCA1MZ\nmYyGubuvCNt39/EYFr1ND4XsZGMd2JB2iu0HJpWfHKO6SYOk/8n2Gemes86w5V+3\nkGeslklVVhq3FK74zta3ygv41RGeSbEY1vOBq1wZ+pD1VvlB6Hfn/2LuuIHAgqjn\nFQIDAQAB\n-----END PUBLIC KEY-----"
    });
    $httpProvider.interceptors.push("CitizenOSOpenIDAuthInterceptor"); // Interceptor that includes the authorization headers for authorizing CitizenOS requests
});

// This is how Angular-Moment wants to be configured..
app.run(function(amMoment, toruConfig) {
    console.log("app.run toruConfig", toruConfig);
    amMoment.changeLocale(toruConfig.language.default);
});
'use strict';
