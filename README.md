Rahvaalgatus
============
The website of <https://rahvaalgatus.ee> built with JavaScript on Node.js, Jade/Pug for templates and Sass for CSS.

Rahvaalgatus is dependent on [CitizenOS][]'s' backend. While it's not yet available publicly (as of Sep 13, 2017 at least), they do provide a test environment to develop against. Its tokens are embedded in Rahvaalgatus' source code, so no configuration necessary.

[CitizenOS]: https://citizenos.com


Development
-----------
After installing a stable version of [Node.js](https://nodejs.org) (so far tested against Node.js v4 and NPM v2), follow these steps:

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
   make server
   ```

   For a different port, pass `PORT` to Make:
   ```sh
   make server PORT=8888
   ```

4. Set up a <rahvaalgatus.dev> domain.

   CitizenOS's backend server replies to cross-origin requests only if they come from `rahvalgatus.dev`. Add such a subdomain to your `/etc/hosts` file for development:

   ```
   127.0.0.1 rahvaalgatus.dev
   ```

5. Open your local domain (e.g. <http://rahvaalgatus.dev:3000>) in your browser and proceed with typing code.

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

Phone        | Personal id
-------------|------------
+37200000766 | 11412090004
+37060000007 | 51001091072

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

[moll]: http://themoll.com
[kogu]: https://www.kogu.ee
[issues]: https://github.com/rahvaalgatus/rahvaalgatus/issues
[teeme]: http://www.teemeara.ee
[about]: https://rahvaalgatus.ee/about
