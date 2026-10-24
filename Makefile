NAME = google-translate
DIST = dist
OUT ?= $(HOME)/chrome/$(NAME)

up: build install

build:
	bun ./build.ts

install:
	@mkdir -p "$(OUT)"
	@rsync -a --delete "$(DIST)/" "$(OUT)/"
	@echo "已输出到 $(OUT)，在 chrome://extensions 里加载该目录"

dev:
	bun ./build.ts --watch

test:
	bun test

check:
	bunx tsc --noEmit

clean:
	rm -rf "$(DIST)"

zip: build
	@rm -f "$(NAME).zip"
	@cd "$(DIST)" && zip -qr "../$(NAME).zip" . -x '*.map'
	@echo "已打包 $(NAME).zip"
