NODE = node
NODE_OPTS =
PORT = 3000
ENV = development
NPM_REBUILD = npm --ignore-scripts false rebuild --build-from-source
TEST = test/**/*_test.js
TEST_TAGS =
MOCHA = ./node_modules/.bin/_mocha
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
	--prune-empty-dirs \
	--exclude ".*" \
	--exclude "/app/***" \
	--exclude "/config/staging.json" \
	--exclude "/config/production.json" \
	--exclude "/stylesheets/***" \
	--exclude "/test/***" \
	--exclude "/scripts/***" \
	--exclude "/db/*.sqlite3" \
	--exclude "/node_modules/co-mocha/***" \
	--exclude "/node_modules/livereload/***" \
	--exclude "/node_modules/mitm/***" \
	--exclude "/node_modules/mocha/***" \
	--exclude "/node_modules/must/***" \
	--exclude "/node_modules/node-sass/***" \
	--exclude "/node_modules/sqlite3/***" \
	--exclude "/tmp/***"

export PORT
export ENV
export TEST

ifneq ($(filter test spec autotest autospec test/%, $(MAKECMDGOALS)),)
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

test: db/test.sqlite3
	@$(NODE) $(NODE_OPTS) $(MOCHA) -R dot $(TEST)

spec: db/test.sqlite3
	@$(NODE) $(NODE_OPTS) $(MOCHA) -R spec $(TEST)

autotest: db/test.sqlite3
	@$(NODE) $(NODE_OPTS) $(MOCHA) -R dot --watch $(TEST)

autospec: db/test.sqlite3
	@$(NODE) $(NODE_OPTS) $(MOCHA) -R spec --watch $(TEST)

test/server: export TEST_TAGS = server
test/server:
	@$(NODE) $(NODE_OPTS) $(MOCHA) -R spec test/server/**/*_test.js

server:
	@$(NODE) ./bin/web

livereload:
	@$(NODE) $(NODE_OPTS) ./node_modules/.bin/livereload public --wait 50

shrinkwrap:
	npm shrinkwrap

rebuild:
	$(NPM_REBUILD) node-sass
	$(NPM_REBUILD) sqlite3

db/create: db/$(ENV).sqlite3

db/test:
	rm -f db/test.sqlite3
	$(MAKE) db/test.sqlite3

db/%.sqlite3:
	sqlite3 "$@" < db/database.sql

deploy:
	@rsync $(RSYNC_OPTS) . "$(APP_HOST):./$(or $(APP_PATH), $(error "APP_PATH"))/"
	ssh $(APP_HOST) pm2 reload $(notdir $(APP_PATH))

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
.PHONY: test/server
.PHONY: server
.PHONY: shrinkwrap
.PHONY: deploy staging production
.PHONY: db/create db/test
.PHONY: translations
