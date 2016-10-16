NODE = node
NODE_OPTS =
PORT = 3000
ENV = development
TEST =
TEST_OPTS =
TEST_URL = http://dev.rahvaalgatus.ee:3000
JADE = ./node_modules/.bin/jade
SASS = ./node_modules/.bin/node-sass --recursive --indent-type tab --indent-width 1 --output-style expanded
GRUNT = ./node_modules/.bin/grunt
DEPLOY_HOST =
TRANSLATIONS_URL = https://spreadsheets.google.com/feeds/list/1JKPUNp8Y_8Aigq7eGJXtWT6nZFhd31k2Ht3AjC-i-Q8/1/public/full?alt=json
JQ_OPTS = --tab --sort-keys
SELENIUM_BROWSER = chrome

STAGING_HOST = staging.rahvaalgatus.ee
PRODUCTION_HOST = production.rahvaalgatus.ee
APP_HOST = app.rahvaalgatus.ee

LFTP_MIRROR_OPTS = \
	--verbose=1 \
	--continue \
	--parallel=4 \
	--dereference \
	--reverse \
	--exclude node_modules/root/ \
	--exclude \.git/ \
	--exclude-glob .* \
	--exclude-glob .git* \
	--delete

export PORT
export ENV
export TEST
export TEST_URL
export SELENIUM_BROWSER

love:
	@echo "Feel like makin' love."

compile: javascripts stylesheets views

autocompile:
	$(MAKE) -j3 autojavascripts autostylesheets autoviews

javascripts:
	$(GRUNT) uglify:dev

autojavascripts:
	$(GRUNT) watch

stylesheets:
	$(SASS) --output public/stylesheets stylesheets

autostylesheets: SASS := $(SASS) --watch
autostylesheets: stylesheets

views:
	$(JADE) --hierarchy --out public views

autoviews: JADE := $(JADE) --watch
autoviews: views

test:
	@$(NODE) $(NODE_OPTS) ./node_modules/.bin/_mocha -R dot $(TEST_OPTS)

spec:
	@$(NODE) $(NODE_OPTS) ./node_modules/.bin/_mocha -R spec $(TEST_OPTS)

autotest:
	@$(NODE) $(NODE_OPTS) ./node_modules/.bin/_mocha -R dot --watch $(TEST_OPTS)

autospec:
	@$(NODE) $(NODE_OPTS) ./node_modules/.bin/_mocha -R spec --watch $(TEST_OPTS)

server:
	@$(NODE) bin/web

shrinkwrap:
	npm shrinkwrap

deploy: DEPLOY_HOST ?= $(error "Please set DEPLOY_HOST")
deploy:
	lftp "$(DEPLOY_HOST)" -e "mirror $(LFTP_MIRROR_OPTS) ./public .; exit"

staging: DEPLOY_HOST = $(STAGING_HOST)
staging: deploy

staging/app: DEPLOY_HOST = $(APP_HOST)
staging/app: tmp/deploy
staging/app:
	lftp "$(DEPLOY_HOST)" -e "mirror $(LFTP_MIRROR_OPTS) tmp/deploy/ .; exit"

production: DEPLOY_HOST = $(PRODUCTION_HOST)
production: deploy

public/languages: public/languages/en.json
public/languages: public/languages/et.json
public/languages: public/languages/ru.json

public/languages/en.json: tmp/translations.json
	jq $(JQ_OPTS) -f scripts/translation.jq --arg lang english "$<" > "$@"

public/languages/et.json: tmp/translations.json
	jq $(JQ_OPTS) -f scripts/translation.jq --arg lang estonian "$<" > "$@"
	
public/languages/ru.json: tmp/translations.json
	jq $(JQ_OPTS) -f scripts/translation.jq --arg lang russian "$<" > "$@"

tmp:
	mkdir -p tmp

tmp/translations.json: tmp
	wget "$(TRANSLATIONS_URL)" -O "$@"

tmp/deploy:
	git clone . "$@"
	
.PHONY: love
.PHONY: compile autocompile
.PHONY: javascripts autojavascripts
.PHONY: stylesheets autostylesheets
.PHONY: views autoviews
.PHONY: test spec autotest autospec
.PHONY: server
.PHONY: shrinkwrap
.PHONY: deploy staging production
.PHONY: public/languages
