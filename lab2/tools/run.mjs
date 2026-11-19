import { spawn } from 'node:child_process';
import net from 'node:net';
import { build, ROOT } from './build.mjs';
import { createDevServer } from './dev-server.mjs';

build();
// Случайный свободный порт для FastCGI: не подключаемся к чужому серверу.
const reservation = net.createServer();
await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
const fcgiPort = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const java = spawn('java', [`-DFCGI_PORT=${fcgiPort}`, '-jar', 'build/lab2.jar'], { cwd: ROOT, stdio: 'inherit' });
const server = createDevServer(fcgiPort);
let stopping = false;
function stop() {
    if (stopping) return;
    stopping = true;
    java.kill();
    server.close();
    server.closeAllConnections();
}
java.on('error', error => { console.error(error.message); stop(); process.exitCode = 1; });
java.on('exit', () => { if (!stopping) { console.error('Java-сервер остановился.'); stop(); process.exitCode = 1; } });
server.on('error', error => { console.error(error.message); stop(); process.exitCode = 1; });
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
server.listen(8080, '127.0.0.1', () => console.log('Откройте http://localhost:8080 — остановка: Ctrl+C'));
