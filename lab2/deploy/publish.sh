#!/bin/sh
set -eu
cd "$(dirname "$0")"
destination="$HOME/public_html/lab2"
mkdir -p "$destination"
chmod 755 "$HOME/public_html" "$destination"
cp public_html/index.php public_html/.htaccess "$destination/"
chmod 644 "$destination/index.php" "$destination/.htaccess"
echo 'Published: https://se.ifmo.ru/~s504568/lab2/'
