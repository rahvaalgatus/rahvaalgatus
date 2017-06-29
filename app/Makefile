NODE = node
ENV = development
FILES = $(patsubst %, public/assets/%.js, html5 inputs hwcrypto)
BROWSERIFY = ./node_modules/.bin/browserify
WATCHIFY = ./node_modules/.bin/watchify -v
UGLIFY = ./node_modules/.bin/uglifyjs

BROWSERIFY_OPTS =
BROWSERIFY_OPTS += --no-detect-globals

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

public/assets:
	mkdir -p "$@"

public/assets/html5.js:
	@echo "Compiling $@ for $(ENV)…"
	@$(BROWSERIFY) $(BROWSERIFY_OPTS) --entry ./$(@F:%.js=%) --outfile "$@"

public/assets/inputs.js:
	@echo "Compiling $@ for $(ENV)…"
	@$(BROWSERIFY) $(BROWSERIFY_OPTS) \
		--require pikaday \
		--outfile "$@"

public/assets/hwcrypto.js:
	@echo "Compiling $@ for $(ENV)…"
	@$(BROWSERIFY) $(BROWSERIFY_OPTS) \
		--require ./$(@F:%.js=%):@rahvaalgatus/$(@F:%.js=%) \
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
.PHONY: shrinkwrap

# Precious stops Make from deleting files after exiting autocompiling.
.PRECIOUS: $(FILES)
