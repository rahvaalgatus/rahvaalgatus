Rahvaalgatus
============
The frontend for <https://rahvaalgatus.ee>, dependent on [CitizenOS]'s backend.

[CitizenOS]: https://citizenos.com


Development
-----------
An Angular-based frontend built upon the proof-of-concept of CitizenOS's frontend.

1. Install the JavaScript modules necessary for building the frontend:

   ```sh
   npm install
   ```

2. Compile the frontend with Make:

   ```sh
   make compile
   ```

3. Run the server in another tab:
   ```sh
   make server
   ```

   For a different port, pass `PORT` to Make:
   ```sh
   make server PORT=8888
   ```

4. Set up a <*.rahvaalgatus.ee> domain.

   CitizenOS's backend server replies to cross-origin requests only if they come from `*.rahvalgatus.ee`. Add such a subdomain to your `/etc/hosts` file for development:

   ```
   127.0.0.1 dev.rahvaalgatus.ee
   ```

5. Open your local domain (e.g. <http://dev.rahvaalgatus.ee:3000>) in your browser and proceed with code typing.

### Autocompiling

To have the frontend be compiled automatically as you change files, use `autocompile`:

```sh
make autocompile
```


Testing
-------
The project has a Ruby MiniTest and Watir WebDriver based test harness ready. 

1. Install the required Ruby gems:

   ```sh
   bundle install
   ```

2. Run tests with `spec`:

   ```sh
   make spec
   ```

### Autotesting

To have the UI tests run automatically as you change files, use `autospec`:

```sh
make autospec
```
