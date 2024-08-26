NODE = node
NODE_OPTS = --use-strict --require j6pack/register
ENV = development
NPM = npm
NPM_REBUILD = $(NPM) --ignore-scripts false rebuild --build-from-source
TEST = $$(find test -name "*_test.js" -o -name "*_test.jsx")
TEST_TAGS =
MOCHA = ./node_modules/.bin/_mocha
SASS = ./node_modules/.bin/sass --style expanded --no-source-map
BUNDLE = bundle
TRANSLATIONS_URL = https://docs.google.com/spreadsheets/d/1JKPUNp8Y_8Aigq7eGJXtWT6nZFhd31k2Ht3AjC-i-Q8/gviz/tq?tqx=out:json&tq&gid=0
LOCAL_GOVERNMENTS_URL = https://docs.google.com/spreadsheets/d/1DynXZ8Um9TsiYPDaYW3-RTgaPy8hsdq9jj72G41yrVE/gviz/tq?tqx=out:json&tq&gid=0
JQ_OPTS = --tab
DB = config/$(ENV).sqlite3
SHANGE = vendor/shange -f "$(DB)"
WEB_PORT = 3000
ADM_PORT = $(shell expr $(WEB_PORT) + 1)
LIVERELOAD_PORT = 35731
APP_HOST = rahvaalgatus.ee

RSYNC_OPTS = \
	--compress \
	--recursive \
	--links \
	--itemize-changes \
	--omit-dir-times \
	--times \
	--delete \
	--prune-empty-dirs \
	--perms \
	--chmod=ug+rwX,Dg+s,Do=X,Fo=rX \
	--exclude "/.*" \
	--exclude "/app/***" \
	--exclude "/config/development.*" \
	--exclude "/config/staging.*" \
	--exclude "/config/production.*" \
	--exclude "/config/*.sqlite3*" \
	--exclude "/assets/***" \
	--exclude "/test/***" \
	--exclude "/scripts/***" \
	--exclude "/node_modules/co-mocha/***" \
	--exclude "/node_modules/livereload/***" \
	--exclude "/node_modules/mitm/***" \
	--exclude "/node_modules/mocha/***" \
	--exclude "/node_modules/must/***" \
	--exclude "/node_modules/sass/***" \
	--exclude "/node_modules/jsdom/***" \
	--exclude "/node_modules/better-sqlite3/build/***" \
	--exclude "/node_modules/sharp/build/***" \
	--exclude "/node_modules/sharp/vendor/***" \
	--exclude "/node_modules/emailjs-mime-parser/***" \
	--exclude "/node_modules/sinon/***" \
	--exclude "/tmp/***"

export PORT
export ENV
export LIVERELOAD_PORT

ifneq ($(filter test spec autotest autospec test/%, $(MAKECMDGOALS)),)
	ENV = test

	# Times west of UTC are better to test invalid date parsing behavior as then
	# any given UTC time at midnight would be on the previous day in local time.
	export TZ = America/Noronha
endif

love: compile

compile: javascripts
compile: stylesheets
compile: public/503.html

autocompile:
	$(MAKE) -j2 autojavascripts autostylesheets

javascripts:
	$(MAKE) -C app compile

autojavascripts:
	$(MAKE) -C app autocompile

minify:
	$(MAKE) -C app minify

stylesheets:
	@$(SASS) assets:public/assets

autostylesheets: stylesheets
	@$(MAKE) SASS="$(SASS) --watch" "$<"

fonticons:
	@$(BUNDLE) exec fontcustom compile

public/%.html: views/%.jsx
	@echo "Compiling $@…"
	@$(NODE) --require j6pack/register -e 'console.log(require("./$<")())' > "$@"

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

web: PORT = $(WEB_PORT)
web:
	@$(NODE) $(NODE_OPTS) ./bin/$@

adm: PORT = $(ADM_PORT)
adm:
	@$(NODE) $(NODE_OPTS) ./bin/$@

servers:
	@$(MAKE) -j2 web adm

livereload:
	@$(NODE) \
		./node_modules/.bin/livereload public --wait 50 --port $(LIVERELOAD_PORT)

shrinkwrap:
	$(NPM) shrinkwrap --dev

rebuild:
	cd node_modules/better-sqlite3 && \
	$(NPM) --ignore-scripts false run build-release
	$(NPM_REBUILD) sharp --sharp-dist-base-url=http://localhost:0

config/database.sql:
	@$(SHANGE) schema > config/database.sql

%.sqlite3:
	sqlite3 "$@" < config/database.sql

db/create: $(DB)

db/status:
	@$(SHANGE) status

db/migrate:
	@$(SHANGE) migrate
	@$(SHANGE) schema > config/database.sql

db/migration: NAME = $(error "Please set NAME.")
db/migration:
	@$(SHANGE) create "$(NAME)"

staging:
	@rsync $(RSYNC_OPTS) . "$(APP_HOST):/var/www/rahvaalgatus-next"

staging/diff: override RSYNC_OPTS += --dry-run
staging/diff: staging

production:
	@rsync $(RSYNC_OPTS) . "$(APP_HOST):/var/www/rahvaalgatus"

production/diff: override RSYNC_OPTS += --dry-run
production/diff: production

api/publish: openapi.yaml
	http --session-read-only=rahvaalgatus post https://api.swaggerhub.com/apis/rahvaalgatus/rahvaalgatus Content-Type:application/yaml oas==3.0.0 < "$<"

translations: lib/i18n/en.json
translations: lib/i18n/et.json
translations: lib/i18n/ru.json

translatables: JQ_MAP_GOVERNMENTS = 'keys[] | [\
	"DESTINATION_\(.)", \
	"SIGNATURES_COLLECTED_FOR_\(.)", \
	"MISSING_N_SIGNATURES_FOR_\(.)", \
	"initiative_page.signing_section.description.\(.)" \
	] | .[]'
translatables:
	@ag --nofilename -o '\b(t\(|renderEmail\((\w+\.lang, )?)"([\w.]+)"' |\
		grep -v '^$$' | sort -u | cut -d\" -f2
	@jq -r $(JQ_MAP_GOVERNMENTS) lib/local_governments.json
	@echo en
	@echo et
	@echo ru
	@echo MISSING_N_SIGNATURES_FOR_parliament
	@echo SIGNATURES_COLLECTED_FOR_parliament
	@echo DESTINATION_parliament
	@echo CURSEWORDS

tmp:; mkdir -p tmp

tmp/translations.json: tmp
	curl -H "X-DataSource-Auth: true" "$(TRANSLATIONS_URL)" | sed -e 1d > "$@"

tmp/local_governments.json: tmp
	curl -H "X-DataSource-Auth: true" "$(LOCAL_GOVERNMENTS_URL)" |\
	sed -e 1d > "$@"

lib/i18n/en.json: JQ_OPTS += --sort-keys --arg lang English
lib/i18n/et.json: JQ_OPTS += --sort-keys --arg lang Estonian
lib/i18n/ru.json: JQ_OPTS += --sort-keys --arg lang Russian
lib/i18n/en.json \
lib/i18n/et.json \
lib/i18n/ru.json: tmp/translations.json
	jq $(JQ_OPTS) -f scripts/translation.jq "$<" > "$@"

lib/local_governments.json: scripts/local_governments.jq
lib/local_governments.json: tmp/local_governments.json
	jq $(JQ_OPTS) -f scripts/local_governments.jq "$<" > "$@"

config/tsl: config/tsl/ee.xml
config/tsl: config/tsl/ee_test.xml

config/tsl/ee.xml:
	wget "https://sr.riik.ee/tsl/estonian-tsl.xml" -O "$@"

config/tsl/ee_test.xml:
	wget "https://open-eid.github.io/test-TL/EE_T.xml" -O "$@"

test/fixtures: test/fixtures/john_ecdsa.pub
test/fixtures: test/fixtures/john_rsa.pub
test/fixtures: test/fixtures/eid_2007_rsa.pub
test/fixtures: test/fixtures/esteid_2011_rsa.pub
test/fixtures: test/fixtures/esteid_2015_rsa.pub
test/fixtures: test/fixtures/esteid_2018_ecdsa.pub
test/fixtures: test/fixtures/eid_2016_rsa.pub
test/fixtures: test/fixtures/eid_2021e_ecdsa.pub

test/fixtures/%_rsa.key:
	openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$@"

test/fixtures/%_rsa.pub: test/fixtures/%_rsa.key
	openssl rsa -pubout -in "$<" -out "$@"

test/fixtures/%_ecdsa.key:
	openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:prime256v1 -out "$@"

test/fixtures/%_ecdsa.pub: test/fixtures/%_ecdsa.key
	openssl ec -in "$<" -pubout -out "$@"

.PHONY: love
.PHONY: compile autocompile
.PHONY: javascripts autojavascripts
.PHONY: minify
.PHONY: stylesheets autostylesheets
.PHONY: test spec autotest autospec
.PHONY: test/server
.PHONY: servers web adm
.PHONY: shrinkwrap
.PHONY: staging staging/diff production production/diff
.PHONY: db/create db/status db/migrate db/migration
.PHONY: translations
.PHONY: config/tsl

.PRECIOUS: test/fixtures/%_rsa.key
.PRECIOUS: test/fixtures/%_ecdsa.key
