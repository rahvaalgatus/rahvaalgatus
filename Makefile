NODE = node
PORT = 3000
ENV = development
STAGING_HOST = staging.rahvaalgatus.ee
LFTP_MIRROR_OPTS = --verbose=1 --continue --reverse --delete --dereference

export PORT
export ENV

love:
	@echo "Feel like makin' love."

compile:
	./node_modules/.bin/grunt uglify:dev

autocompile:
	./node_modules/.bin/grunt watch

server:
	@$(NODE) bin/www

shrinkwrap:
	npm shrinkwrap --dev

staging:
	lftp $(STAGING_HOST) -e "mirror $(LFTP_MIRROR_OPTS) ./public .; exit"
	
.PHONY: love
.PHONY: compile autocompile
.PHONY: server
.PHONY: shrinkwrap
.PHONY: staging
