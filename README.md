Rahvaalgatus
============
[![Build status][travis-badge]](https://travis-ci.org/rahvaalgatus/rahvaalgatus)

The website of <https://rahvaalgatus.ee> built with JavaScript on Node.js, [JSX](https://github.com/moll/js-j6pack/) for templates and [Sass](https://sass-lang.com/) for CSS. It uses SQLite for its database, which is bundled with the [Sqlite3](https://www.npmjs.com/package/sqlite3) Node.js package. No external database servers required.

[travis-badge]: https://travis-ci.org/rahvaalgatus/rahvaalgatus.svg?branch=master


Development
-----------
After installing a stable version of [Node.js](https://nodejs.org) (so far tested against Node.js v6 and NPM v2), follow these steps:

1. Install the JavaScript modules necessary for the server and client-side components.

   ```sh
   npm install
   cd app && npm install
   ```

   Ensure NPM uses the included `npm-shrinkwrap.json` file to get the exact same versions Rahvaalgatus was developed with.

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

   While Rahvaalgatus works fine when accessed via <http://localhost>, its email confirmation and notification emails use the host from `Config.url` (`config/development.json` for the development environment). To be able to click on links in emails during development, update the configuration to use <localhost> or set up your preferred domain.

   To use <rahvaalgatus.test>, add it to your `/etc/hosts` file:

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

#### Mobile-Id
To test signing in or signing initiatives with Mobile-Id, use one of the Mobile-Id test phone numbers:

Phone        | Personal id | Name
-------------|-------------|-----
+37200000766 | 60001019906 | Mary Änn O’Connež-Šuslik Testnumber
+37200000566 | 60001018800 | Mary Änn O’Connež-Šuslik Testnumber (PNOEE-certificate)

For more info and test numbers, see the [SK ID Solutions wiki][mobile-id-test]. You can also [register your own phone number](https://demo.sk.ee/MIDCertsReg/index.php) for use in the demo environment.


#### Smart-Id
To test signing in or signing initiatives with Smart-Id, use the following test personal id:

Personal id | Name
------------|-----
10101010005 | Demo Smart-Id

For more test ids, see the [Smart-Id documentation wiki][smart-id-test].

[mobile-id-test]: https://github.com/SK-EID/MID/wiki/Test-number-for-automated-testing-in-DEMO
[smart-id-test]: https://github.com/SK-EID/smart-id-documentation/wiki/Environment-technical-parameters#test-accounts-for-automated-testing


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

See the full API documentation on [SwaggerHub](https://app.swaggerhub.com/apis-docs/rahvaalgatus/rahvaalgatus) or in a machine-readable OpenAPI v3 format from the [`openapi.yaml`](openapi.yaml) file from this repository. There are a few examples of use in Estonian also on <https://rahvaalgatus.ee/api>.

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
