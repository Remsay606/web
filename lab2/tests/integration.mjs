import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { build, ROOT } from '../tools/build.mjs';
import { fastcgiRequest, createDevServer } from '../tools/dev-server.mjs';

build();
const reservation = net.createServer();
await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const java = spawn('java', [`-DFCGI_PORT=${port}`, '-jar', 'build/lab2.jar'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = '';
java.stderr.on('data', data => { logs += data; });
const server = createDevServer(port);
let checks = 0;

async function call(body = 'x=0&y=0&r=1', overrides = {}) {
    const bytes = Buffer.from(body);
    const raw = await fastcgiRequest({ REQUEST_METHOD: 'POST', CONTENT_TYPE: 'application/x-www-form-urlencoded',
        CONTENT_LENGTH: String(bytes.length), QUERY_STRING: '', ...overrides }, bytes, port);
    const end = raw.indexOf('\r\n\r\n');
    assert.ok(end > 0, 'CGI headers');
    const headers = raw.subarray(0, end).toString('ascii');
    const data = raw.subarray(end + 4);
    assert.equal(data.length, Number(headers.match(/Content-Length: (\d+)/i)[1]));
    return { status: Number(headers.match(/Status: (\d+)/)[1]), json: JSON.parse(data.toString('utf8')), headers };
}

async function point(x, y, r, expected) {
    const result = await call(new URLSearchParams({ x: String(x), y: String(y), r: String(r) }).toString());
    assert.equal(result.status, 200, JSON.stringify(result));
    assert.equal(result.json.hit, expected, `(${x}, ${y}), R=${r}`);
    assert.equal(result.json.y, String(y).replace(/^ +| +$/g, ''), 'Y должен вернуться без изменения цифр и разделителя');
    assert.ok(Number.isFinite(Date.parse(result.json.time)));
    assert.ok(Number.isSafeInteger(result.json.elapsedMicros) && result.json.elapsedMicros >= 0);
    checks++;
}

try {
    // Даже самое первое подключение может оборваться без FastCGI-заголовка.
    for (let i = 0; i < 60; i++) {
        const connected = await new Promise(resolve => {
            const socket = net.createConnection({ host: '127.0.0.1', port });
            socket.on('connect', () => { socket.end(); resolve(true); });
            socket.on('error', () => resolve(false));
        });
        if (connected) break;
        await delay(100);
    }
    let ready = false;
    for (let i = 0; i < 60; i++) {
        try { await call(); ready = true; break; } catch { await delay(100); }
    }
    assert.ok(ready, `Java did not start: ${logs}`);
    // Обрыв FastCGI посреди тела не должен зациклить чтение и повесить следующие запросы.
    for (let attempt = 0; attempt < 3; attempt++) {
        const frame = (type, data = Buffer.alloc(0)) => {
            const header = Buffer.from([1, type, 0, 1, 0, 0, 0, 0]);
            header.writeUInt16BE(data.length, 4);
            return Buffer.concat([header, data]);
        };
        const params = Buffer.concat(Object.entries({ REQUEST_METHOD: 'POST',
            CONTENT_TYPE: 'application/x-www-form-urlencoded', CONTENT_LENGTH: '11' })
            .map(([key, value]) => Buffer.concat([Buffer.from([key.length, value.length]), Buffer.from(key), Buffer.from(value)])));
        await new Promise((resolve, reject) => {
            const socket = net.createConnection({ host: '127.0.0.1', port }, () => {
                socket.end(Buffer.concat([frame(1, Buffer.from([0, 1, 0, 0, 0, 0, 0, 0])),
                    frame(4, params), frame(4), frame(5, Buffer.from('x=0&y='))]));
            });
            socket.on('data', () => {});
            socket.on('error', () => {});
            socket.setTimeout(3000, () => { socket.destroy(); reject(new Error('Broken request stuck')); });
            socket.on('close', resolve);
        });
        assert.equal((await call()).status, 200); checks++;
    }
    for (const r of [1, 1.5, 2, 2.5, 3]) {
        await point(0, 0, r, true);
        await point(0, -r / 2, r, true);
        await point(1, 0, r, r >= 1);
        await point(-1, 0, r, r >= 2);
        await point(-1, 0.5, r, r >= 3);
        await point(1, -0.5, r, r >= 2);
        await point(-1, -0.5, r, false);
        await point(4, 1, r, false);
        await point(5, -1, r, false);
        if (r < 3) {
            await point(0, r, r, true);
            await point(0, -r, r, true);
        }
    }
    await point(1, '1.73205080756887729352744634150587236694280525381038062805580697', 2, true);
    await point(1, '1.73205080756887729352744634150587236694280525381038062805580698', 2, false);
    await point(0, '2.99999999999999999999999999999999999999999999999999999999999', 3, true);
    await point(0, '-2.99999999999999999999999999999999999999999999999999999999999', 3, true);
    await point(-1, '0.50000000000000000000000000000000000000000000000000001', 3, false);
    await point(1, '-2.00000000000000000000000000000000000000000000000000001', 2, false);
    await point(0, '+.5', 1, true);
    await point(0, '-0', 1, true);
    await point(0, ' 0,5 ', 1, true);
    await point(0, '.' + '0'.repeat(62) + '1', 1, true);
    for (const digits of [100, 2000, 70000, 300000]) {
        await point(0, '2,' + '9'.repeat(digits), 3, true);
        await point(-1, '0.' + '5' + '0'.repeat(digits) + '1', 3, false);
        await point(0, '0000.5000' + '0'.repeat(digits), 1, true);
    }
    // Крошечная дробь остаётся положительной: на x = R она уже вне круга.
    await point(1, '0.' + '0'.repeat(70000) + '1', 1, false);
    await point(0, '-0,' + '0'.repeat(70000), 1, true);

    const invalidY = ['', '3', '-3', '3.000000000000000000000001', '-3.00000000000000000001',
        'NaN', 'Infinity', '-Infinity', '1e0', '0x1', '1 2', '1,2,3', '--1', '.', '−1',
        '<script>alert(1)</script>', '1'.repeat(65), '1\n2', '1\u0000', '3,109',
        '3,' + '0'.repeat(300000), '2.' + '1'.repeat(300000) + 'x'];
    const badBodies = ['x=0&y=0', 'x=0&y=0&r=1&x=1', 'x=0&y=0&r=1&foo=1',
        'x=0&y=0&x=1', 'x=0&y=%GG&r=1', 'x=0&y=%&r=1', 'x=0&y=0&r=1&',
        'x=0&y=0&r', 'X=0&y=0&r=1', 'x=0&y=0&r=1%00', 'x=0.5&y=0&r=1',
        'x=6&y=0&r=1', 'x=-4&y=0&r=1', 'x=0&y=0&r=0', 'x=0&y=0&r=4', 'x=0&y=0&r=1e0'];
    for (const y of invalidY) badBodies.push(new URLSearchParams({ x: '0', y, r: '1' }).toString());
    for (const body of badBodies) {
        assert.equal((await call(body)).status, 400, body);
        // После каждого плохого запроса процесс обязан отвечать на следующий.
        assert.equal((await call()).status, 200);
        checks += 2;
    }
    for (const [overrides, expected] of [
        [{ REQUEST_METHOD: 'GET' }, 405], [{ REQUEST_METHOD: 'PUT' }, 405],
        [{ REQUEST_METHOD: 'DELETE' }, 405], [{ CONTENT_TYPE: 'application/json' }, 415],
        [{ CONTENT_TYPE: '' }, 415], [{ CONTENT_LENGTH: '-1' }, 400],
        [{ CONTENT_LENGTH: '' }, 400], [{ CONTENT_LENGTH: '9999999999' }, 400],
        [{ CONTENT_LENGTH: '1025' }, 400], [{ CONTENT_LENGTH: '0' }, 400],
        [{ CONTENT_LENGTH: '16' }, 400], [{ QUERY_STRING: 'x=0' }, 400]
    ]) {
        assert.equal((await call('x=0&y=0&r=1', overrides)).status, expected);
        assert.equal((await call()).status, 200);
        checks += 2;
    }
    assert.equal((await call('x'.repeat(1025))).status, 400); checks++;
    assert.equal((await call('x'.repeat(1025), { CONTENT_LENGTH: '1' })).status, 400); checks++;
    // Сетка: сравнение с независимой геометрией на двоичных дробях (без погрешности).
    for (const r of [1, 1.5, 2, 2.5, 3]) {
        for (let x = -3; x <= 5; x++) {
            for (let y = -2.75; y < 3; y += 0.25) {
                const expected = (x >= 0 && y >= 0 && x * x + y * y <= r * r)
                    || (x <= 0 && y >= 0 && y <= x + r / 2)
                    || (x >= 0 && x <= r / 2 && y <= 0 && y >= -r);
                await point(x, y, r, expected);
            }
        }
    }
    const concurrent = await Promise.all(Array.from({ length: 20 }, () => call()));
    assert.ok(concurrent.every(result => result.status === 200)); checks += 20;
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const name of ['/', '/index.html', '/script.js', '/style.css']) {
        const response = await fetch(base + name);
        assert.equal(response.status, 200); assert.ok((await response.text()).length > 0); checks++;
    }
    assert.equal((await fetch(base + '/src/Main.java')).status, 404); checks++;
    const posted = await fetch(base + '/api/check', { method: 'POST', body: new URLSearchParams({ x: '1', y: '-1', r: '2' }) });
    assert.equal(posted.status, 200); assert.equal((await posted.json()).hit, true); checks++;
    const longY = '2,' + '9'.repeat(300000);
    const longPosted = await fetch(base + '/api/check', { method: 'POST', body: new URLSearchParams({ x: '0', y: longY, r: '3' }) });
    assert.equal(longPosted.status, 200);
    const longResult = await longPosted.json();
    assert.equal(longResult.y, longY);
    assert.equal(longResult.hit, true); checks++;
    const wrongMethod = await fetch(base + '/api/check');
    assert.equal(wrongMethod.status, 405); assert.equal(wrongMethod.headers.get('allow'), 'POST'); checks++;
    console.log(`PASS: ${checks} проверок; реальные FastCGI-запросы, границы, валидация, серия и параллельные подключения, локальный HTTP.`);
} finally {
    java.kill();
    server.close();
    server.closeAllConnections();
}
