#!/bin/sh
set -eu
cd "$(dirname "$0")"
mkdir -p build/classes build/lib
cp lib/fastcgi-lib.jar build/lib/fastcgi-lib.jar
printf 'Manifest-Version: 1.0\nMain-Class: Main\nClass-Path: lib/fastcgi-lib.jar\n\n' > build/MANIFEST.MF
javac --release 17 -encoding UTF-8 -cp lib/fastcgi-lib.jar -d build/classes src/AreaChecker.java src/RequestHandler.java src/Main.java
jar cfm build/lab2.jar build/MANIFEST.MF -C build/classes .
echo 'Собрано: build/lab2.jar'
