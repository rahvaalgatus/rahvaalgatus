NODE = node
FILES = $(patsubst %, public/assets/%.js, html5 inputs hwcrypto editor local)
BROWSERIFY = ./node_modules/.bin/browserify
WATCHIFY = ./node_modules/.bin/watchify --verbose
UGLIFY = ./node_modules/.bin/uglifyjs

BROWSERIFY_OPTS =
BROWSERIFY_OPTS += --no-detect-globals
BROWSERIFY_OPTS += --extension=jsx --transform j6pack/browserify

UGLIFY_OPTS =
UGLIFY_OPTS += --stats
# Not mangling atm for debugging purposes.
#UGLIFY_OPTS += --mangle

love: public/assets
	@$(MAKE) $(FILES)

compile: love

autocompile:
	@$(MAKE) --always-make -j $(words $(FILES)) BROWSERIFY="$(WATCHIFY)" $(FILES)

minify: $(patsubst %.js, %.min.js, $(FILES))
	@for file in $^; do mv "$$file" "$${file%.min.js}.js"; done

public/assets:
	mkdir -p "$@"

public/assets/html5.js:
	@echo "Compiling $@…"
	@$(BROWSERIFY) $(BROWSERIFY_OPTS) --entry ./$(@F:%.js=%) --outfile "$@"

public/assets/inputs.js:
	@echo "Compiling $@…"
	@$(BROWSERIFY) $(BROWSERIFY_OPTS) \
		--require pikaday \
		--outfile "$@"

public/assets/hwcrypto.js:
	@echo "Compiling $@…"
	@$(BROWSERIFY) $(BROWSERIFY_OPTS) \
		--require ./$(@F:%.js=%):@rahvaalgatus/$(@F:%.js=%) \
		--outfile "$@"

public/assets/editor.js:
	@echo "Compiling $@…"
	@$(BROWSERIFY) $(BROWSERIFY_OPTS) \
		--entry ./$(@F:%.js=%) \
		--require trix \
		--outfile "$@"

public/assets/local.js: ../tmp/local_governments.geojson.json
public/assets/local.js:
	@echo "Compiling $@…"
	@$(BROWSERIFY) $(BROWSERIFY_OPTS) \
		--require ./$(@F:%.js=%):@rahvaalgatus/$(@F:%.js=%) \
		--outfile "$@"

public/assets/%.max.js: public/assets/%.js
	@mv "$<" "$@"

public/assets/%.min.js: public/assets/%.max.js
	@echo "Minifying $(@D)/$*.js…"
	@$(UGLIFY) $(UGLIFY_OPTS) --output "$@" -- "$<"

../tmp:
	mkdir -p ../tmp

../tmp/local_governments.geojson.json: ../tmp
../tmp/local_governments.geojson.json: ../lib/local_governments.json
../tmp/local_governments.geojson.json: ../lib/local_governments.geojson
../tmp/local_governments.geojson.json: ../scripts/local_governments_geojson.jq
	jq $(JQ_OPTS) -c -f ../scripts/local_governments_geojson.jq \
		--slurpfile govs ../lib/local_governments.json \
		../lib/local_governments.geojson \
		> "$@"

shrinkwrap:
	npm shrinkwrap --dev

.PHONY: love
.PHONY: compile autocompile minify
.PHONY: shrinkwrap
.PHONY: $(FILES)

# Precious stops Make from deleting files after exiting autocompiling.
.PRECIOUS: $(FILES)
