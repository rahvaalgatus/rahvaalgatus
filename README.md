Rahvaalgatus
============
[![Build status][travis-badge]](https://travis-ci.org/rahvaalgatus/rahvaalgatus)

The website of <https://rahvaalgatus.ee> built with JavaScript on Node.js, [JSX](https://github.com/moll/js-j6pack/) for templates and [Sass](https://sass-lang.com/) for CSS. It uses SQLite for its database, which is bundled with the [Better Sqlite3](https://www.npmjs.com/package/better-sqlite3) Node.js package. No external database servers required.

[travis-badge]: https://travis-ci.org/rahvaalgatus/rahvaalgatus.svg?branch=master


Development
-----------
After installing a stable version of [Node.js](https://nodejs.org) (so far tested against Node.js v14 and NPM v2), follow these steps:

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

   Note that you also need to have [`jq`](https://stedolan.github.io/jq/) v1.6 or later installed as compiling some of the assets depend on Jq scripts.

3. Initialize the database:

   ```sh
   make db/create
   ```

   Note that for generating the initial SQLite database via Make, you need to have the SQLite command line application available. Try installing it either via your package manager or from [SQLite's home page](https://www.sqlite.org). Ensure it's at least version 3.24. Alternatively you can initialize the SQLite database with `config/database.sql` via some other means. The `sqlite3` executable isn't required during runtime.

4. Run the server:
   ```sh
   make web
   ```

   For a different port, pass `PORT` to Make:
   ```sh
   make web PORT=8888
   ```

5. Set up the <rahvaalgatus.test> domains.

   While Rahvaalgatus home page works fine when accessed via <http://localhost>, its parliament and local government sites link to specific subdomains. Email confirmation and notification emails also use the host from `Config.url` (`config/development.json` for the development environment). To be able to click on links in emails during development, update the configuration to use <localhost> or set up your preferred domain.

   To use <rahvaalgatus.test>, add it to your `/etc/hosts` file:

   ```
   127.0.0.1 rahvaalgatus.test
   127.0.0.1 riigikogu.rahvaalgatus.test
   127.0.0.1 kohalik.rahvaalgatus.test
   ```

6. Open your local domain (e.g. <http://rahvaalgatus.test:3000>) in your browser and proceed with typing code.

### Autocompiling
To have the frontend JavaScripts and stylesheets be compiled automatically as you change files, use `autocompile`:

```sh
make autocompile
```

### Environments
Environment specific configuration for the server is in `config/$ENV.js`. To run it in the production environment, for example, pass `ENV` to Make:

```sh
make web ENV=production
```

The few client-side JavaScript files of Rahvaalgatus, however, are not dependent on the environment.

### Accounts

#### Mobile-Id
To test signing in or signing initiatives with Mobile-Id, use one of the Mobile-Id test phone numbers:

Phone        | Personal id | Name
-------------|-------------|-----
+37268000769<br>+37258000769 | 60001017869 | Eid2016 Testnumber
+37200000766 | 60001019906 | Mary Änn O’Connež-Šuslik Testnumber
+37200000566 | 60001018800 | Mary Änn O’Connež-Šuslik Testnumber (PNOEE-certificate)

For more info and test numbers, see the [SK ID Solutions wiki][mobile-id-test].

#### Smart-Id
To test signing in or signing initiatives with Smart-Id, use the following test personal id:

Personal id | Name
------------|-----
30303039914 | Qualified Ok1 Testnumber
30303039903 | Qualified Ok Testnumber
30303039816 | Multiple Ok Testnumber
39912319997 | Bod Testnumber

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
