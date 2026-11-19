#!/bin/sh
set -eu
cd "$(dirname "$0")"
exec java -DFCGI_PORT="${FCGI_PORT:-24001}" -jar build/lab2.jar
