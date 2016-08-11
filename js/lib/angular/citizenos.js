'use strict';

/**
 * CitizenOS
 *
 * Requires Angular >=1.4
 */

(function (window, angular) {
    var app = angular.module('CitizenOS', ['angular-storage']);

    app.provider('CitizenOSOpenId', function () {
        var config = null;

        this.setConfig = function (conf) {
            config = conf;
        };

        this.$get = ['$window', '$location', '$log', '$httpParamSerializer', 'store', function ($window, $location, $log, $httpParamSerializer, store) {
            if (typeof KJUR === 'undefined') throw new Error('CitizenOSOpenId requires JSRSASIGN library to work. Please include the library - http://kjur.github.io/jsrsasign/jsrsasign-latest-all-min.js');
            if (!config) throw new Error('CitizenOSOpenId requires config to be set. Set the config in configuration phase using CitizenOSOpenIdProvider.setConfig().');

            /**
             * Generate a random string
             *
             * @param {number} length
             *
             * @returns {string}
             */
            var randomString = function (length) {
                var text = '';
                var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

                for (var i = 0; i < length; i++)
                    text += possible.charAt(Math.floor(Math.random() * possible.length));

                return text;
            };

            /**
             * Parse parameters from URI hash
             *
             * @param {string} hash
             *
             * @returns {Object}
             */
            var parseParamsFromHash = function (hash) {
                var result = {};
                hash.split('&').forEach(function (param) {
                    var keyVal = param.split('=');
                    var obj = {};
                    result[keyVal[0]] = keyVal[1];
                    return obj;
                });
                return result;
            };

            /**
             * Remove all persisted state from storage.
             */
            var removeState = function () {
                store.remove(config.cookies.accessToken);
                store.remove(config.cookies.nonce);
                store.remove(config.cookies.state);
            };

            return {
                /**
                 * Authorize against CitizenOS Open ID server
                 *
                 * Compiles the payload and redirects to CitizenOS authorization server
                 *
                 * @param {object} [stateObject] State object that Client will get back from validate() function once the authorization has been completed. Used to store state between authorization and callback.
                 * @param {string} [lang=en] ISO-2 letter language code for the login and consent screens.
                 *
                 * @see http://openid.net/specs/openid-connect-implicit-1_0.html#rfc.section.2.1.1
                 */
                authorize: function (stateObject, lang) {
                    var nonce = randomString(16);
                    store.set(config.cookies.nonce, nonce);

                    // OpenID "state" parameter value. State is stored in a session cookie. Authorization callback contains "state" value and allows to get state from the cookie.
                    if (stateObject) {
                        var state = randomString(12);
                        var data = {
                            id: state, // This Client will verify on callback
                            payload: stateObject // Whatever the Client wants to store to preserve state
                        };
                        store.set(config.cookies.state, data);
                    }

                    var path = config.authorizationUri;
                    var params = {
                        response_type: config.responseType,
                        client_id: config.clientId,
                        redirect_uri: config.redirectUri,
                        scope: config.scope,
                        nonce: nonce,
                        state: state,
                        ui_locales: lang || 'en' // http://openid.net/specs/openid-connect-implicit-1_0.html#rfc.section.2.1.1.1
                    };

                    $window.location.href = path + '?' + $httpParamSerializer(params);
                },
                /**
                 * Validate CitizneOS Open ID authorization callback
                 *
                 * Expects all the callback parameters to be in url hash (#param1=..&param2=).
                 *
                 * @returns {Object|null} If authorization was a success, {accessToken: .., state: ...}.
                 *      IF an error callback is received, an error object is returned instead.  {error: 'invalid_scope', error_description: '...'} - see: https://tools.ietf.org/html/rfc6749#section-4.1.2.1
                 *      IF token validation fails, null is returned.
                 */
                validate: function () {
                    var params = parseParamsFromHash($location.hash());

                    // Seems we have a error callback
                    if (params.error) { // Possible errors - https://tools.ietf.org/html/rfc6749#section-4.1.2.1
                        return params;
                    }

                    var idToken = params.id_token;
                    var accessToken = params.access_token;
                    var state = params.state;

                    try {
                        var idTokenParsed = KJUR.jws.JWS.parse(idToken);
                    } catch (e) {
                        $log.error('Failed to parse JWT token', idToken, e);
                        return;
                    }

                    var idTokenHeader = idTokenParsed.headerObj;
                    var idTokenPayload = idTokenParsed.payloadObj;

                    // The Client MUST validate the signature of the ID Token according to JWS [JWS] using the algorithm specified in the alg Header Parameter of the JOSE Header. The Client MUST use the keys provided by the Issuer.
                    var publicKey = KEYUTIL.getKey(config.publicKey);
                    var isValid = KJUR.jws.JWS.verifyJWT(
                        idToken,
                        publicKey,
                        {
                            alg: [idTokenHeader.alg],
                            iss: [config.authorizationUri.match(/https\:\/\/[^\/]*/)[0]], // The Issuer Identifier for the OpenID Provider (which is typically obtained during Discovery) MUST exactly match the value of the iss (issuer) Claim.
                            aud: [config.clientId], // The Client MUST validate that the aud (audience) Claim contains its client_id value registered at the Issuer identified by the iss (issuer) Claim as an audience. The ID Token MUST be rejected if the ID Token does not list the Client as a valid audience, or if it contains additional audiences not trusted by the Client.
                            verifyAt: parseInt(new Date().getTime() / 1000) + 1 * 60 * 1000 // The current time MUST be before the time represented by the exp Claim (possibly allowing for some small leeway to account for clock skew).
                        }
                    );

                    if (!isValid) {
                        $log.error('Invalid JWT token. Check your service configuration.', idTokenParsed);
                        removeState();
                        return;
                    }

                    // Nonce - The value of the nonce Claim MUST be checked to verify that it is the same value as the one that was sent in the Authentication Request. The Client SHOULD check the nonce value for replay attacks. The precise method for detecting replay attacks is Client specific.
                    var nonceStored = store.get(config.cookies.nonce);
                    $log.debug('nonceStored', nonceStored, 'idTokenPayload.nonce', idTokenPayload.nonce);
                    if (!idTokenPayload.nonce || !nonceStored || idTokenPayload.nonce !== store.get(config.cookies.nonce)) {
                        $log.error('Invalid JWT token. Nonce validation failed.', nonceStored, idTokenPayload.nonce, idTokenParsed);
                        removeState();
                        return;
                    } else {
                        store.remove(config.cookies.nonce); // Nonce validation succeeded, we can drop it from storage
                    }

                    // State - OAuth 2.0 state value. REQUIRED if the state parameter is present in the Authorization Request. Clients MUST verify that the state value is equal to the value of state parameter in the Authorization Request.
                    var stateStored = store.get(config.cookies.state);
                    // In addition, check that "state" is present
                    if (stateStored && (!state || stateStored.id !== state)) {
                        $log.error('State validation failed!', state, stateStored);
                        return;
                    }
                    var statePayload = stateStored.payload;
                    store.remove(config.cookies.state);

                    // VALIDATE access_token - http://openid.net/specs/openid-connect-implicit-1_0.html#rfc.section.2.2.2
                    // Hash the octets of the ASCII representation of the access_token with the hash algorithm specified in JWA [JWA] for the alg Header Parameter of the ID Token's JOSE Header. For instance, if the alg is RS256, the hash algorithm used is SHA-256.
                    var md = new KJUR.crypto.MessageDigest({alg: 'sha' + idTokenHeader.alg.match(/[0-9]*$/)[0], prov: 'cryptojs'});
                    md.updateString(accessToken);
                    var hash = md.digest();
                    // Take the left-most half of the hash and base64url-encode it.
                    var expectedAtHash = stob64u(hash.slice(0, 32));
                    // The value of at_hash in the ID Token MUST match the value produced in the previous step if at_hash is present in the ID Token.
                    if (idTokenPayload.at_hash !== expectedAtHash) {
                        $log.error('Access token hash (at_hash) validation failed', idTokenPayload.at_hash, expectedAtHash);
                        removeState();
                        return;
                    }

                    $log.info('Open ID callback successfully validated.', accessToken, statePayload);

                    // Store the access token for further usage
                    store.set(config.cookies.accessToken, accessToken);

                    return {
                        accessToken: accessToken,
                        state: statePayload
                    };
                },
                unauthorize: function () {
                    removeState();
                },
                /**
                 * Get the access token (access_token) stored after successful validation.
                 */
                getAccessToken: function () {
                    console.log('getAccessToken', config.cookies.accessToken, store);
                    return store.get(config.cookies.accessToken);
                },
                getConfig: function () {
                    return config;
                }
            }
        }];
    });

    /**
     * HTTP Provider interceptor that will provide CitizenOS authorization headers
     */
    app.service('CitizenOSOpenIDAuthInterceptor', ['CitizenOSOpenId', function (CitizenOSOpenId) {
        this.request = function(config) {
            var re = /https:\/\/[^\/]*/;

            // Only send token to API requests that go to the same domain as the authorization requests itself.
            if (config.url.match(re) && config.url.match(re)[0] === CitizenOSOpenId.getConfig().authorizationUri.match(re)[0]) {
                // Lets check that the top level domain name matches for the request, only then pass the authorization header.
                var accessToken = CitizenOSOpenId.getAccessToken();
                if (accessToken && !hasAuthorization(config.headers)) {
									config.headers.Authorization = 'Bearer ' + accessToken;
                }
            }

            return config;
        };
    }]);

		function hasAuthorization(obj) {
			for (var key in obj) if (key.toLowerCase() == "authorization") return true
			return false
		}
})(window, angular);
