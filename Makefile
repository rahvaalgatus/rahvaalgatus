NODE = node
PORT = 3000
ENV = development

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
	
.PHONY: love
.PHONY: compile autocompile
.PHONY: server
