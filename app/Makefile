NODE = node
ENV = development
FILES = $(patsubst %, public/assets/%.js, app hwcrypto)
BROWSERIFY = ./node_modules/.bin/browserify
WATCHIFY = ./node_modules/.bin/watchify -v
UGLIFY = ./node_modules/.bin/uglifyjs
JADE = ./node_modules/.bin/jade

BROWSERIFY_OPTS =
BROWSERIFY_OPTS += --no-detect-globals
BROWSERIFY_OPTS += --noparse ./lib/angular/angular.js
BROWSERIFY_OPTS += --noparse ./lib/angular/angular-moment.js
BROWSERIFY_OPTS += --noparse ./lib/jsrsasign-latest-all-min.js
BROWSERIFY_OPTS += --noparse ./lib/moment-with-locales.js
BROWSERIFY_OPTS += --noparse ./vendor/jquery.min.js
BROWSERIFY_OPTS += --noparse ./vendor/jquery-ui.min.js

UGLIFY_OPTS =
UGLIFY_OPTS += --stats
# Not mangling atm for debugging purposes.
#UGLIFY_OPTS += --mangle

love:
	@echo "Feel like makin' love."

compile: public/assets
	$(MAKE) --always-make $(FILES)

minify: $(patsubst %.js, %.min.js, $(FILES))
	@for file in $^; do mv "$$file" "$${file%.min.js}.js"; done

autocompile:
	@$(MAKE) --always-make -j $(words $(FILES)) BROWSERIFY="$(WATCHIFY)" $(FILES)

views:
	$(JADE) --hierarchy --out public views

autoviews: JADE := $(JADE) --watch
autoviews: views

public/assets:
	mkdir -p "$@"

public/assets/app.js:
	@echo "Compiling $@ for $(ENV)…"
	@$(BROWSERIFY) \
		$(BROWSERIFY_OPTS) \
		--require ./config/$(ENV).js:root/config \
		--require ./lib/angular/angular.js:angular \
		--require ./lib/lodash.js:lodash \
		--require ./lib/jsrsasign-latest-all-min.js:jsrsasign \
		--require ./lib/moment-with-locales.js:moment \
		--entry ./ \
		--outfile "$@"

public/assets/hwcrypto.js:
	@echo "Compiling $@ for $(ENV)…"
	@$(BROWSERIFY) \
		$(BROWSERIFY_OPTS) \
		--require ./hwcrypto:@rahvaalgatus/hwcrypto \
		--outfile "$@"

public/assets/%.max.js: public/assets/%.js
	@mv "$<" "$@"

public/assets/%.min.js: public/assets/%.max.js
	@echo "Minifying $(@D)/$*.js…"
	@$(UGLIFY) $(UGLIFY_OPTS) --output "$@" -- "$<"

shrinkwrap:
	npm shrinkwrap --dev

.PHONY: love
.PHONY: compile autocompile minify
.PHONY: views autoviews
.PHONY: shrinkwrap

# Precious stops Make from deleting files after exiting autocompiling.
.PRECIOUS: $(FILES)
