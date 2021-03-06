all: build

icons: static/icon64.png static/icon128.png static/icon48.png static/icon16.png static/icon64-active.png static/icon128-active.png static/icon48-active.png static/icon16-active.png
build: icons static/webln-bundle.js static/content-bundle.js static/background-bundle.js static/popup-bundle.js static/options-bundle.js static/style.css

static/icon%.png: icon.png
	convert $< -resize $*x$* $@

static/icon%-active.png: icon-active.png
	convert $< -resize $*x$* $@

static/background-bundle.js: src/background.js src/predefined-behaviors.js src/current-action.js src/utils.js src/interfaces/index.js src/interfaces/lightningd_spark.js src/interfaces/eclair.js src/interfaces/ptarmigan.js
	./node_modules/.bin/browserifyinc $< -dv --outfile $@

static/content-bundle.js: src/content.js src/utils.js
	./node_modules/.bin/browserifyinc $< -dv --outfile $@

static/webln-bundle.js: src/webln.js src/utils.js
	./node_modules/.bin/browserifyinc $< -dv --outfile $@

static/popup-bundle.js: src/popup.js $(shell find src/components/)
	./node_modules/.bin/browserifyinc $< -dv --outfile $@

static/options-bundle.js: src/options.js src/utils.js
	./node_modules/.bin/browserifyinc $< -dv --outfile $@

static/style.css: src/style.styl
	./node_modules/.bin/stylus < $< > $@

extension.zip: build
	cd static/ && \
        for file in $$(ls *.js); \
          do ../node_modules/.bin/terser $$file --compress --mangle | sponge $$file; \
        done; \
        zip -r extension * && \
        mv extension.zip ../

sources.zip: build
	rm -fr tmpsrc/
	mkdir -p tmpsrc
	mkdir -p tmpsrc/src
	mkdir -p tmpsrc/static
	cd static && \
        cp -r *.html ../tmpsrc/static/
	cd src && \
        cp -r *.js ../tmpsrc/src
	cp *.png package.json Makefile README.md tmpsrc/
	cd tmpsrc/ && \
        zip -r sources * && \
        mv sources.zip ../
