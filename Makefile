NODE = node
RUBY = ruby
PORT = 3000
ENV = development
TEST_OPTS =
TEST_URL = http://dev.rahvaalgatus.ee:3000

STAGING_HOST = staging.rahvaalgatus.ee
LFTP_MIRROR_OPTS = --verbose=1 --continue --reverse --delete --dereference

export PORT
export ENV
export TEST_URL

love:
	@echo "Feel like makin' love."

compile:
	./node_modules/.bin/grunt uglify:dev

autocompile:
	./node_modules/.bin/grunt watch

spec: $(wildcard test/*_test.rb)
	@$(RUBY) -I. $(addprefix -r, $^) -e ""

autospec:
	@bundle exec autotest

server:
	@$(NODE) bin/www

shrinkwrap:
	npm shrinkwrap --dev

staging:
	lftp $(STAGING_HOST) -e "mirror $(LFTP_MIRROR_OPTS) ./public .; exit"
	
.PHONY: love
.PHONY: compile autocompile
.PHONY: spec autospec
.PHONY: server
.PHONY: shrinkwrap
.PHONY: staging
