#!/bin/sh
# Для консоли WinSCP: процессы запускаются в фоне и не держат окно команды.
set -eu
cd "$(dirname "$0")"
base=$(pwd -P)
mkdir -p httpd-root/mutex-dir httpd-root/fastcgi
conf="$base/config/httpd.conf"
pidfile="$base/httpd-root/java.pid"
jarfile="$base/build/lab2.jar"
http_port=$(awk '$1 == "Listen" {print $2; exit}' "$conf")
fcgi_port=$(sed -n 's/.*-host 127\.0\.0\.1:\([0-9][0-9]*\).*/\1/p' "$conf")
[ -n "$http_port" ] && [ -n "$fcgi_port" ] || { echo 'Missing ports in httpd.conf'; exit 1; }
[ "$http_port" != "$fcgi_port" ] || { echo 'HTTP and FastCGI ports must differ.'; exit 1; }

java_running() {
    [ -s "$pidfile" ] || return 1
    pid=$(cat "$pidfile")
    case "$pid" in ''|*[!0-9]*) return 1 ;; esac
    kill -0 "$pid" 2>/dev/null || return 1
    ps -ww -p "$pid" -o args= | grep -F -- "$jarfile" >/dev/null
}

start_java() {
    if java_running; then echo 'Java already running.'; return; fi
    nohup java -Xms16m -Xmx128m -DFCGI_PORT="$fcgi_port" \
        -DFCGI_THREADS="${FCGI_THREADS:-4}" -DDEMO_DELAY_MS="${DEMO_DELAY_MS:-0}" \
        -jar "$jarfile" > "$base/httpd-root/java.log" 2>&1 < /dev/null &
    echo "$!" > "$pidfile"
    sleep 1
    if ! java_running; then cat "$base/httpd-root/java.log"; return 1; fi
    echo 'Java started.'
}

stop_java() {
    if ! java_running; then echo 'Java is not running.'; return; fi
    kill "$pid"
    attempts=0
    while java_running; do
        attempts=$((attempts + 1))
        [ "$attempts" -le 10 ] || { echo 'Java is still stopping. Retry later.'; return 1; }
        sleep 1
    done
    echo 'Java stopped.'
}

case "${1:-start}" in
    start)
        /usr/local/sbin/httpd -t -f "$conf"
        start_java
        /usr/local/sbin/httpd -f "$conf" -k start
        if [ -f "$base/publish.sh" ]; then sh "$base/publish.sh"; fi
        echo "HTTP port: $http_port; FastCGI port: $fcgi_port"
        echo 'Open: https://se.ifmo.ru/~s504568/lab2/'
        ;;
    stop-java) stop_java ;;
    start-java) start_java ;;
    stop)
        stop_java
        /usr/local/sbin/httpd -f "$conf" -k stop
        ;;
    *) echo 'Usage: sh server.sh [start|stop-java|start-java|stop]'; exit 1 ;;
esac
