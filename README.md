Rahvaalgatus
============
[![Build status][travis-badge]](https://travis-ci.org/rahvaalgatus/rahvaalgatus)

The website of <https://rahvaalgatus.ee> built with JavaScript on Node.js, [JSX](https://github.com/moll/js-j6pack/) for templates and [Sass](https://sass-lang.com/) for CSS.

Rahvaalgatus is dependent on [CitizenOS][]'s [backend](https://github.com/citizenos/citizenos-api). While open sourced late March 2018, the full backend may be too much to run locally for development. Fortunately they provide an online test environment to develop against. Its tokens are embedded in Rahvaalgatus' source code, so no configuration necessary.

[CitizenOS]: https://citizenos.com
[travis-badge]: https://travis-ci.org/rahvaalgatus/rahvaalgatus.svg?branch=master


Development
-----------
After installing a stable version of [Node.js](https://nodejs.org) (so far tested against Node.js v6 and NPM v2), follow these steps:

1. Install the JavaScript modules necessary for the server and client-side components.

   ```sh
   npm install
   cd app && npm install
   ```

2. Compile the client-side JavaScripts and stylesheets with Make:

   ```sh
   make
   ```

3. Run the server:
   ```sh
   make web
   ```

   For a different port, pass `PORT` to Make:
   ```sh
   make web PORT=8888
   ```

4. Set up a <rahvaalgatus.test> domain.

   CitizenOS's authentication and editor servers reply to cross-origin requests only if they come from `rahvalgatus.test`. Add such a subdomain to your `/etc/hosts` file for development:

   ```
   127.0.0.1 rahvaalgatus.test
   ```

5. Open your local domain (e.g. <http://rahvaalgatus.test:3000>) in your browser and proceed with typing code.

### Autocompiling

To have the frontend JavaScripts and stylesheets be compiled automatically as you change files, use `autocompile`:

```sh
make autocompile
```

### Environments

Environment specific configuration for the server is in `config/$ENV.js`. To run it in the production environment, for example, pass `ENV` to Make:

```sh
make server ENV=production
```

The few client-side JavaScript files of Rahvaalgatus, however, are not dependent on the environment.

### Accounts
To sign in during development, use one of the [Mobile-Id test phone numbers](http://www.id.ee/?lang=en&id=36381):

Phone        | Personal id | Name
-------------|-------------|-----
+37200000766 | 60001019906 | Mary
+37060000007 | 51001091072 | Juhan

See more at <http://www.id.ee/?lang=en&id=36381>.


Testing
-------
The project has JavaScript server unit tests written with [Mocha][mocha], [Must.js][must] and [Mitm.js][mitm].

Run them with Make:

```sh
make test
```

To run a specific test, use the `$TEST` environment variable when invoking Make:

```sh
make test TEST=./test/bin/web_test.js
```

### Autotesting

To have the tests run automatically as you change files, use `autotest`:

```sh
make autotest
```
[mocha]: https://mochajs.org/
[must]: https://github.com/moll/js-must
[mitm]: https://github.com/moll/node-mitm


API
---
Rahvaalgatus also has a public API available that's usable both from the server side and via client-side JavaScript, if you wish to embed a signature counter on your initiative's marketing page, for example.

An example of getting the number of signatures on an initiative:

```sh
curl https://rahvaalgatus.ee/initiatives/92cc16ee-107e-4208-b92c-2ffed24d4f4b -H "Accept:application/vnd.rahvaalgatus.initiative+json; v=1"
```

See the full API documentation on [SwaggerHub](https://app.swaggerhub.com/apis-docs/rahvaalgatus/rahvaalgatus) or in a machine-readable OpenAPI v3 format from the [`openapi.yaml`](openapi.yaml) file from this repository.

We're open to adding more structured data to the public API, so feel free to [create an issue on GitHub][issues] if you find something's missing.


License
-------
Rahvaalgatus is released under the *GNU Affero General Public License*, which in
summary means:

- You **can** use this program for **no cost**.
- You **can** use this program for **both personal and commercial reasons**.
- You **have to share the source code** when you run it online.
- You **have to share modifications** (e.g bug-fixes) you've made to this program.

For more details, see the `LICENSE` file.


About
-----
Development of Rahvaalgatus is led and sponsored by **[SA Eesti Koostöö Kogu][kogu]**.  
Parts of it sponsored by **[Andri Möll][moll]** and **[Teeme Ära SA][teeme]**.  
More details [about Rahvaalgatus the platform][about].  

If you find Rahvaalgatus needs improving, please don't hesitate to [create an issue on GitHub][issues].

[moll]: https://m811.com
[kogu]: https://www.kogu.ee
[issues]: https://github.com/rahvaalgatus/rahvaalgatus/issues
[teeme]: http://www.teemeara.ee
[about]: https://rahvaalgatus.ee/about
