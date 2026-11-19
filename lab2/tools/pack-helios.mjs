// Готовый комплект для папки на Helios, показанной пользователем в WinSCP.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './build.mjs';

const output = path.join(ROOT, 'helios-upload');
for (const directory of ['public', 'build/lib', 'config', 'public_html']) {
    mkdirSync(path.join(output, directory), { recursive: true });
}
for (const file of ['public/index.html', 'public/style.css', 'public/script.js',
    'build/lab2.jar', 'build/lib/fastcgi-lib.jar']) {
    copyFileSync(path.join(ROOT, file), path.join(output, file));
}
const config = readFileSync(path.join(ROOT, 'config/httpd.conf'), 'utf8')
    .replaceAll('/home/studs/s504568/lab2', '/home/studs/s504568/web/lab2')
    .replaceAll('$HOME/lab2', '$HOME/web/lab2')
    .replaceAll('127.0.0.1:24001', '127.0.0.1:35481');
writeFileSync(path.join(output, 'config/httpd.conf'), config.replaceAll('\r\n', '\n'));
writeFileSync(path.join(output, 'server.sh'),
    readFileSync(path.join(ROOT, 'deploy/server.sh'), 'utf8').replaceAll('\r\n', '\n'));
for (const file of ['public_html/index.php', 'public_html/.htaccess', 'publish.sh']) {
    writeFileSync(path.join(output, file),
        readFileSync(path.join(ROOT, 'deploy', file), 'utf8').replaceAll('\r\n', '\n'));
}
console.log(`Для WinSCP: ${output}`);
