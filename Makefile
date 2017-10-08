NODE = node
NODE_OPTS =
PORT = 3000
ENV = development
NPM_REBUILD = npm --ignore-scripts false rebuild --build-from-source
TEST = test/**/*_test.js
TEST_TAGS =
SASS = ./node_modules/.bin/node-sass --recursive --indent-type tab --indent-width 1 --output-style expanded
TRANSLATIONS_URL = https://spreadsheets.google.com/feeds/list/1JKPUNp8Y_8Aigq7eGJXtWT6nZFhd31k2Ht3AjC-i-Q8/1/public/full?alt=json
JQ_OPTS = --tab --sort-keys

APP_HOST = rahvaalgatus.ee
APP_PATH =

RSYNC_OPTS = \
	--compress \
	--recursive \
	--links \
	--itemize-changes \
	--omit-dir-times \
	--times \
	--delete \
	--delete-excluded \
	--prune-empty-dirs \
	--exclude ".*" \
	--exclude "/tags" \
	--exclude "/app/***" \
	--exclude "/stylesheets/***" \
	--exclude "/test/***" \
	--exclude "/scripts/***" \
	--exclude "/node_modules/co-mocha/***" \
	--exclude "/node_modules/livereload/***" \
	--exclude "/node_modules/mitm/***" \
	--exclude "/node_modules/mocha/***" \
	--exclude "/node_modules/must/***" \
	--exclude "/node_modules/node-sass/***" \
	--exclude "/tmp/***"

export PORT
export ENV
export TEST

ifneq ($(filter test spec autotest autospec, $(MAKECMDGOALS)),)
	ENV = test
endif

love: compile

compile: javascripts stylesheets

autocompile:
	$(MAKE) -j2 autojavascripts autostylesheets

javascripts:
	$(MAKE) -C app compile

autojavascripts:
	$(MAKE) -C app autocompile

minify:
	$(MAKE) -C app minify

stylesheets:
	$(SASS) --output public/assets stylesheets

autostylesheets: stylesheets
	$(MAKE) SASS="$(SASS) --watch" "$<"

test:
	@$(NODE) $(NODE_OPTS) ./node_modules/.bin/_mocha -R dot $(TEST)

spec:
	@$(NODE) $(NODE_OPTS) ./node_modules/.bin/_mocha -R spec $(TEST)

autotest:
	@$(NODE) $(NODE_OPTS) ./node_modules/.bin/_mocha -R dot --watch $(TEST)

autospec:
	@$(NODE) $(NODE_OPTS) ./node_modules/.bin/_mocha -R spec --watch $(TEST)

server:
	@$(NODE) ./bin/web

livereload:
	@$(NODE) $(NODE_OPTS) ./node_modules/.bin/livereload public --wait 50

shrinkwrap:
	npm shrinkwrap

rebuild:
	$(NPM_REBUILD) node-sass

deploy:
	@rsync $(RSYNC_OPTS) . "$(APP_HOST):./$(or $(APP_PATH), $(error "APP_PATH"))/"

staging: APP_PATH = htdocs/rahvaalgatus-staging
staging: deploy

production: APP_PATH = htdocs/rahvaalgatus
production: deploy

translations: lib/i18n/en.json
translations: lib/i18n/et.json
translations: lib/i18n/ru.json

tmp:
	mkdir -p tmp

tmp/translations.json: tmp
	wget "$(TRANSLATIONS_URL)" -O "$@"

lib/i18n/en.json: tmp/translations.json
	jq $(JQ_OPTS) -f scripts/translation.jq --arg lang english "$<" > "$@"

lib/i18n/et.json: tmp/translations.json
	jq $(JQ_OPTS) -f scripts/translation.jq --arg lang estonian "$<" > "$@"
	
lib/i18n/ru.json: tmp/translations.json
	jq $(JQ_OPTS) -f scripts/translation.jq --arg lang russian "$<" > "$@"

.PHONY: love
.PHONY: compile autocompile
.PHONY: javascripts autojavascripts
.PHONY: minify
.PHONY: stylesheets autostylesheets
.PHONY: test spec autotest autospec
.PHONY: server
.PHONY: shrinkwrap
.PHONY: deploy staging production
.PHONY: translations
