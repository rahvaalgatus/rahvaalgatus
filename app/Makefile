NODE = node
ENV = development
FILES = $(patsubst %, public/assets/%.js, index)
BROWSERIFY = ./node_modules/.bin/browserify
WATCHIFY = ./node_modules/.bin/watchify -v

BROWSERIFY_OPTS =
BROWSERIFY_OPTS += --no-detect-globals
BROWSERIFY_OPTS += --noparse ./lib/angular/angular.js
BROWSERIFY_OPTS += --noparse ./lib/angular/angular-moment.js
BROWSERIFY_OPTS += --noparse ./lib/jsrsasign-latest-all-min.js
BROWSERIFY_OPTS += --noparse ./lib/moment-with-locales.js

love:
	@echo "Feel like makin' love."

compile: public/assets
	$(MAKE) --always-make $(FILES)

autocompile:
	@$(MAKE) --always-make -j $(words $(FILES)) BROWSERIFY="$(WATCHIFY)" $(FILES)

public/assets:
	mkdir -p "$@"

public/assets/index.js:
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

shrinkwrap:
	npm shrinkwrap --dev

.PHONY: love
.PHONY: compile autocompile
.PHONY: shrinkwrap

# Precious stops Make from deleting files after exiting autocompiling.
.PRECIOUS: $(FILES)
