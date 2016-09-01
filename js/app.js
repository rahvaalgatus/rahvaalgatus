"use strict";

var angular = window.angular
var Config = window.Config
var app = angular.module("app", ["ui.router", "pascalprecht.translate", "angularMoment", "ngKookies", "ngSanitize", "ngDialog", "typeahead", "datePicker", "cfp.hotkeys", "infinite-scroll", "monospaced.elastic", "monospaced.qrcode", "ng.shims.placeholder", "angulartics", "angulartics.google.analytics", "angularHwcrypto", "toruSelect", "toruSessionSettings", "toruUtils", "toruUserVoice", "toruEtherpad", "ngCookies", "angular-storage", "CitizenOS", "djds4rce.angular-socialshare"]);

app.factory("apiUrl", function() {
	return {
		request: function(config) {
			if (config.url.indexOf("api/") > -1 && config.url.indexOf("id.citizenos") == -1) {
				config.url = Config.API_URL + config.url;
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
})

app.config(function($stateProvider, $urlRouterProvider, $locationProvider, $httpProvider, $translateProvider, toruConfig, UserVoiceProvider, CitizenOSOpenIdProvider) {
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
		})

		$stateProvider.state("account", {
			"abstract": true,
			url: "/account",
			templateUrl: "/templates/home.html"
		})

		$stateProvider.state("authCallback", {
			url:"/auth/callback",
			controller:function($scope, $location, $state, $stateParams, $window, $log, CitizenOSOpenId) {
				$scope.result = CitizenOSOpenId.validate(); // CitizenOSOpenID service Will read all the params from the hash of the url, that is after #.
				$window.location.href="/";
			}
		})

		$stateProvider.state("account.signup", {
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
		})

		$stateProvider.state("account.login", {
			url: "/login?email&redirectSuccess",
			controller: function($scope, $state) {
				if ($scope.app.user.loggedIn) {
					$state.go("home");
				}
			}
		})

		$stateProvider.state("account.passwordForgot", {
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
		})

		$stateProvider.state("account.passwordReset", {
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
		})

		$stateProvider.state("about", {
			url: "/about",
			templateUrl: "/templates/about.html"
		})

		$stateProvider.state("support", {
			url: "/support_us",
			templateUrl: "/templates/support_us.html"
		})

		$stateProvider.state("discussions", {
			url: "/discussions",
			templateUrl: "/templates/discussions.html"
		})

		$stateProvider.state("goodpractice", {
			url: "/goodpractice",
			templateUrl: "/templates/goodpractice.html"
		})

		$stateProvider.state("votings", {
			url: "/votings",
			templateUrl: "/templates/votings.html"
		})

		$stateProvider.state("topics", {
			abstract: true,
			url: "/topics",
			templateUrl: "/templates/topic.html"
		})

		$stateProvider.state("topics.create1", {
			url: "/create1",
			templateUrl: "/templates/topic.create.html"
		})

		$stateProvider.state("topics.create2", {
			url: "/create2/:id",
			templateUrl: "/templates/topic.create.html"
		})

		$stateProvider.state("addCoauthors", {
			url: "/create3/:id",
			templateUrl: "/templates/topic.addCoauthors.html"
		})

		$stateProvider.state("topics.create", {
			url: "/create",
			templateUrl: "/templates/topic.create.html"
		})

		$stateProvider.state("topics.view", {
			url: "/:id",
			templateUrl: "/templates/topic.view.html"
		})

		$stateProvider.state("topics.view.vote", {
			"abstract": true,
			url: "/votes",
			templateUrl: "/templates/topic.vote.html"
		})

		$stateProvider.state("topics.view.vote.create", {
			url: "/create",
			templateUrl: "/templates/topic.vote.create.html"
		})

		$stateProvider.state("topics.view.renewdeadline", {
			url: "/create",
			templateUrl: "/templates/topic.renew.deadline.html"
		})

		$stateProvider.state("topics.view.vote.view", {
			url: "/:voteId",
			templateUrl: "/templates/topic.vote.view.html"
		})

		$stateProvider.state("topics.view.events", {
			url: "/events",
			templateUrl: "/templates/topic.events.html"
		})

		$stateProvider.state("topics.view.events.create", {
			url: "/create",
			templateUrl: "/templates/topic.events.create.html"
		})

		$stateProvider.state("topics.view.events.view", {
			url: "/:eventId"
		})

		$stateProvider.state("join", {
			// Join a Topic via shared url
			url: "/join/:tokenJoin",
			controller: "JoinCtrl"
		})

		$stateProvider.state("connections", {
			url: "/connections",
			templateUrl: "/templates/connections.html"
		})

		$stateProvider.state("groups", {
			//TODO: convert groups to nested views..
			url: "/groups",
			templateUrl: "/templates/groups.html"
		})

		$stateProvider.state("groupsEdit", {
				url: "/groups/:groupId/edit",
				templateUrl: "/templates/groups.html"
		});

		$translateProvider.useStaticFilesLoader({
			prefix: "/languages/",
			suffix: ".json"
		});

		var LANGUAGES = Object.keys(toruConfig.language.list)
		$translateProvider.registerAvailableLanguageKeys(LANGUAGES)

		$translateProvider.useSanitizeValueStrategy("escaped")
		$translateProvider.useStorage("translateKookieStorage")

		// Using fallback language for some reason breaks translation on page load.
		//$translateProvider.fallbackLanguage("et")
		$translateProvider.preferredLanguage(toruConfig.language.default)

		UserVoiceProvider.setApiKey("X2tNuk059z6CD4Em5Q65KQ");

		////
		$httpProvider.interceptors.push("apiUrl"); // Services use relative url, so we use interceptor for now to fix this :(

		var location = window.location
		var callback = location.protocol + "//" + location.host + "/auth/callback"

		CitizenOSOpenIdProvider.setConfig({
				authorizationUri: Config.AUTHORIZATION_URI,
				responseType: "id_token token",
				clientId: Config.CLIENT_ID,
				redirectUri: callback,
				scope: "openid", // TODO: define scopes
				cookies: { // Names of the cookies used - http://openid.net/specs/openid-connect-implicit-1_0.html#rfc.section.2.1.1.1
						accessToken: "citizenos.accessToken", // Cookie name where CitizenOS OpenID access token (access_token) is stored. This is used to authorize COS requests
						nonce: "citizenos.nonce", // Cookie name where CitizenOS OpenID authorization request nonce (nonce) is stored
						state: "citizenos.state" // Cookie name where CitizenOS OpenID authorization request state (state) is stored
				},
				publicKey: Config.AUTHORIZATION_PUBLIC_KEY
		});
		$httpProvider.interceptors.push("CitizenOSOpenIDAuthInterceptor"); // Interceptor that includes the authorization headers for authorizing CitizenOS requests
});

// This is how Angular-Moment wants to be configured..
app.run(function(amMoment, toruConfig) {
		amMoment.changeLocale(toruConfig.language.default);
});
