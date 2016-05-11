PORT = 3000
ENV = development
export ENV

love:
	@echo "Feel like makin' love."

compile:
	./node_modules/.bin/grunt uglify:dev

autocompile:
	./node_modules/.bin/grunt watch

server:
	python -m SimpleHTTPServer "$(PORT)"
	
.PHONY: love
.PHONY: compile autocompile
.PHONY: server
