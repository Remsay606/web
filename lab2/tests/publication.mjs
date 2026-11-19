// Сквозная проверка опубликованного сайта: HTTPS → PHP-шлюз → Apache → Java.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const base = 'https://se.ifmo.ru/~s504568/lab2/';
let checks = 0;
for (const [route, file] of [['', 'index.html'], ['index.html', 'index.html'],
    ['style.css', 'style.css'], ['script.js', 'script.js']]) {
    const response = await fetch(base + route);
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), readFileSync(new URL('../public/' + file, import.meta.url)));
    checks++;
}
for (const route of ['src/Main.java', 'build/lab2.jar', 'config/httpd.conf', 'other-file']) {
    assert.equal((await fetch(base + route)).status, 404); checks++;
}
for (const [body, expectedStatus, expectedHit] of [
    ['x=1&y=-1.5&r=2', 200, true], ['x=-1&y=-1&r=2', 200, false],
    ['x=0&y=3&r=2', 400], ['x=0&y=3%2C109&r=2', 400],
    ['x=0&y=NaN&r=2', 400], ['x=0&y=0&r=1&x=2', 400]
]) {
    const response = await fetch(base + 'api/check', { method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    assert.equal(response.status, expectedStatus);
    const json = await response.json();
    if (expectedStatus === 200) assert.equal(json.hit, expectedHit);
    else assert.equal(typeof json.error, 'string');
    checks++;
}
const y = '2,' + '9'.repeat(300000) + '000';
const longResponse = await fetch(base + 'api/check', { method: 'POST', body: new URLSearchParams({ x: '0', y, r: '3' }) });
assert.equal(longResponse.status, 200);
const longResult = await longResponse.json();
assert.equal(longResult.y, y);
assert.equal(longResult.hit, true); checks++;
const wrongMethod = await fetch(base + 'api/check');
assert.equal(wrongMethod.status, 405);
assert.equal(wrongMethod.headers.get('allow'), 'POST'); checks++;
const wrongType = await fetch(base + 'api/check', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: '{}' });
assert.equal(wrongType.status, 415); checks++;
const query = await fetch(base + 'api/check?x=0', { method: 'POST', body: new URLSearchParams({ x: '0', y: '0', r: '1' }) });
assert.equal(query.status, 400); checks++;
console.log(`PASS: ${checks} проверок публичного HTTPS-сайта, включая точную передачу дроби длиной более 300000 символов.`);
