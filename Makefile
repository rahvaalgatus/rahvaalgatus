NODE = node
NODE_OPTS = --use-strict --require j6pack/register
ENV = development
NPM_REBUILD = npm --ignore-scripts false rebuild --build-from-source
TEST = $$(find test -name "*_test.js")
TEST_TAGS =
MOCHA = ./node_modules/.bin/_mocha
SASS = ./node_modules/.bin/node-sass --recursive --indent-type tab --indent-width 1 --output-style expanded
BUNDLE = bundle
TRANSLATIONS_URL = https://spreadsheets.google.com/feeds/list/1JKPUNp8Y_8Aigq7eGJXtWT6nZFhd31k2Ht3AjC-i-Q8/1/public/full?alt=json
JQ_OPTS = --tab --sort-keys
SHANGE = vendor/shange -f "config/$(ENV).sqlite3"
PGHOST = $(shell ENV=$(ENV) node -e 'console.log(require("./config").citizenOsDatabase.host)')
LIVERELOAD_PORT = 35731

APP_HOST = rahvaalgatus.ee
APP_PATH = $(error "Please set APP_PATH")

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
	--exclude "/config/*.sqlite3" \
	--exclude "/assets/***" \
	--exclude "/test/***" \
	--exclude "/scripts/***" \
	--exclude "/node_modules/co-mocha/***" \
	--exclude "/node_modules/livereload/***" \
	--exclude "/node_modules/mitm/***" \
	--exclude "/node_modules/mocha/***" \
	--exclude "/node_modules/must/***" \
	--exclude "/node_modules/node-sass/***" \
	--exclude "/node_modules/sqlite3/***" \
	--exclude "/node_modules/jsdom/***" \
	--exclude "/tmp/***"

export PORT
export ENV
export TEST
export PGHOST
export LIVERELOAD_PORT

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
	$(SASS) --output public/assets assets

autostylesheets: stylesheets
	$(MAKE) SASS="$(SASS) --watch" "$<"

fonticons:
	@$(BUNDLE) exec fontcustom compile

test:
	@$(NODE) $(NODE_OPTS) $(MOCHA) -R dot $(TEST)

spec:
	@$(NODE) $(NODE_OPTS) $(MOCHA) -R spec $(TEST)

autotest:
	@$(NODE) $(NODE_OPTS) $(MOCHA) -R dot --watch $(TEST)

autospec:
	@$(NODE) $(NODE_OPTS) $(MOCHA) -R spec --watch $(TEST)

test/server: export TEST_TAGS = server
test/server:
	@$(NODE) $(NODE_OPTS) $(MOCHA) -R spec test/server/**/*_test.js

web: PORT = 3000
web:
	@$(NODE) $(NODE_OPTS) ./bin/$@

adm: PORT = 3001
adm:
	@$(NODE) $(NODE_OPTS) ./bin/$@

servers:
	@$(MAKE) -j2 web adm

livereload:
	@$(NODE) \
		./node_modules/.bin/livereload public --wait 50 --port $(LIVERELOAD_PORT)

shrinkwrap:
	npm shrinkwrap --dev

rebuild:
	$(NPM_REBUILD) node-sass --sass-binary-site=http://localhost:0
	$(NPM_REBUILD) sqlite3

config/database.sql:
	@$(SHANGE) schema > config/database.sql

config/%.sqlite3:
	sqlite3 "$@" < config/database.sql

config/citizenos_database.sql:
	wget https://raw.githubusercontent.com/citizenos/citizenos-api/master/db/config/database.sql -O "$@"

db/create: config/$(ENV).sqlite3

db/test: ENV = test
db/test:
	-createdb -E utf8 -T template0 citizenos_test
	psql -f config/citizenos_database.sql citizenos_test

db/status:
	@$(SHANGE) status

db/migrate:
	@$(SHANGE) migrate
	@$(SHANGE) schema > config/database.sql

db/migration: NAME = $(error "Please set NAME.")
db/migration:
	@$(SHANGE) create "$(NAME)"

deploy:
	@rsync $(RSYNC_OPTS) . "$(APP_HOST):$(or $(APP_PATH), $(error "APP_PATH"))/"

staging: APP_PATH = /var/www/rahvaalgatus-next
staging: deploy

production: APP_PATH = /var/www/rahvaalgatus
production: deploy

translations: lib/i18n/en.json
translations: lib/i18n/et.json
translations: lib/i18n/ru.json

translatables:
	@ag --nofilename -o '\bt\("(\w+)"' | sort -u | cut -d\" -f2

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
.PHONY: servers web adm
.PHONY: shrinkwrap
.PHONY: deploy staging production
.PHONY: db/create db/test db/status db/migrate db/migration
.PHONY: translations
