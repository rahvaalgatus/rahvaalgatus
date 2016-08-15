NODE = node
RUBY = ruby
PORT = 3000
ENV = development
TEST_OPTS =
TEST_URL = http://dev.rahvaalgatus.ee:3000
JADE = ./node_modules/.bin/jade
POSTCSS = ./node_modules/.bin/postcss
GRUNT = ./node_modules/.bin/grunt
DEPLOY_HOST =
CSS = $(addprefix stylesheets/, fonts.css page.css editor.css)
TRANSLATIONS_URL = https://spreadsheets.google.com/feeds/list/1JKPUNp8Y_8Aigq7eGJXtWT6nZFhd31k2Ht3AjC-i-Q8/1/public/full?alt=json
JQ_OPTS = --tab --sort-keys

STAGING_HOST = staging.rahvaalgatus.ee
PRODUCTION_HOST = production.rahvaalgatus.ee
LFTP_MIRROR_OPTS = --verbose=1 --continue --reverse --delete --dereference

export PORT
export ENV
export TEST_URL

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
	$(POSTCSS) --parser postcss-scss --use precss --dir public/stylesheets $(CSS)

autostylesheets: POSTCSS := $(POSTCSS) --watch
autostylesheets: stylesheets

views:
	$(JADE) --hierarchy --pretty --out public views

autoviews: JADE := $(JADE) --watch
autoviews: views

spec: $(wildcard test/*_test.rb)
	@$(RUBY) -I. $(addprefix -r, $^) -e ""

autospec:
	@bundle exec autotest

server:
	@$(NODE) bin/www

shrinkwrap:
	npm shrinkwrap --dev

deploy: DEPLOY_HOST ?= $(error "Please set DEPLOY_HOST")
deploy:
	lftp "$(DEPLOY_HOST)" -e "mirror $(LFTP_MIRROR_OPTS) ./public .; exit"

staging: DEPLOY_HOST = $(STAGING_HOST)
staging: deploy

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
	
.PHONY: love
.PHONY: compile autocompile
.PHONY: javascripts autojavascripts
.PHONY: stylesheets autostylesheets
.PHONY: views autoviews
.PHONY: spec autospec
.PHONY: server
.PHONY: shrinkwrap
.PHONY: deploy staging production
.PHONY: public/languages
