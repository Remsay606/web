// Сравниваем четыре одинаково медленных запроса при одном и четырёх работниках.
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import { ROOT } from '../tools/build.mjs';
import { fastcgiRequest } from '../tools/dev-server.mjs';

async function measure(threads) {
    const reservation = net.createServer();
    await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
    const port = reservation.address().port;
    await new Promise(resolve => reservation.close(resolve));
    const java = spawn('java', [`-DFCGI_PORT=${port}`, `-DFCGI_THREADS=${threads}`,
        '-DDEMO_DELAY_MS=2000', '-jar', 'build/lab2.jar'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] });
    let log = '';
    java.stderr.on('data', data => { log += data; });
    try {
        const sendPoint = async x => {
            const body = Buffer.from(new URLSearchParams({ x: String(x), y: '0.5', r: '2' }).toString());
            return fastcgiRequest({ REQUEST_METHOD: 'POST', CONTENT_TYPE: 'application/x-www-form-urlencoded',
                CONTENT_LENGTH: String(body.length) }, body, port);
        };
        let ready = false;
        for (let i = 0; i < 60; i++) {
            try { await sendPoint(0); ready = true; } catch { ready = false; }
            if (ready) break;
            await wait(100);
        }
        assert.ok(ready, 'Java did not start: ' + log);
        const started = performance.now();
        // Promise.all запускает отправки вместе. Последовательные await
        // проверяли бы поведение клиента, а не параллельность сервера.
        await Promise.all([0, 1, 2, 3].map(async x => {
            const raw = await sendPoint(x);
            const split = raw.indexOf('\r\n\r\n');
            assert.match(raw.subarray(0, split).toString(), /Status: 200/);
            const result = JSON.parse(raw.subarray(split + 4).toString());
            assert.equal(result.x, String(x), 'Ответ должен вернуться своему запросу');
            assert.equal(result.y, '0.5');
        }));
        const elapsed = performance.now() - started;
        console.log(`${threads} работник(а): четыре запроса со sleep(2000) заняли ${(elapsed / 1000).toFixed(2)} с`);
        console.log(log.trim());
        return elapsed;
    } finally {
        java.kill();
    }
}

const sequential = await measure(1);
const parallel = await measure(4);
assert.ok(sequential >= 7500, 'Четыре задержки по 2 секунды должны суммироваться');
assert.ok(parallel >= 1900 && parallel < sequential * 0.65, 'Задержки должны перекрываться');
console.log('PASS: обработка параллельная, ответы не перепутаны.');
