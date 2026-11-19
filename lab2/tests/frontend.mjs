// Проверяем настоящий script.js в изолированном окружении: без библиотек и браузерного профиля.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
const valid = { x: '1', y: '-1.5', r: '2', hit: true, time: '2026-10-31T00:00:00Z', elapsedMicros: 15 };
const KEY = 'lab2-53566-results-v1';
let checks = 0;

function environment(raw = null, blocked = false) {
    const elements = new Map();
    function element() {
        return { value: '', textContent: '', disabled: false, rows: [], events: {}, attributes: {},
            addEventListener(name, callback) { this.events[name] = callback; },
            setAttribute(name, value) { this.attributes[name] = value; },
            getContext() { return null; },
            replaceChildren() { this.rows = []; },
            insertRow() {
                const row = { cells: [], insertCell() { const cell = { textContent: '', dataset: {} }; this.cells.push(cell); return cell; } };
                this.rows.push(row); return row;
            }
        };
    }
    const storage = new Map(raw === null ? [] : [[KEY, raw]]);
    const context = vm.createContext({
        document: { getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); } },
        window: { addEventListener() {} },
        localStorage: {
            getItem(key) { if (blocked) throw new Error('Blocked'); return storage.get(key) ?? null; },
            setItem(key, value) { if (blocked) throw new Error('Quota'); storage.set(key, value); }
        },
        URLSearchParams, AbortController, setTimeout, clearTimeout, TypeError,
        fetch: async () => ({ ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ ...valid }) })
    });
    vm.runInContext(source, context);
    return { context, elements, storage, eval(code) { return vm.runInContext(code, context); } };
}

const env = environment();
for (const y of ['0', '+0', '-0', '.5', '-.5', '1.', '2.99999999999999999999999999999', '-2.9999999999999999999999999999']) {
    assert.equal(env.eval(`checkY(${JSON.stringify(y)})`), ''); checks++;
}
for (const y of ['2,' + '9'.repeat(300000), '-2.' + '9'.repeat(300000),
    '+0002,109000', '0.' + '0'.repeat(300000) + '1', '0'.repeat(300000) + '2.1']) {
    assert.equal(env.eval(`checkY(${JSON.stringify(y)})`), ''); checks++;
}
for (const y of ['3,' + '0'.repeat(300000), '-3.' + '0'.repeat(300000), '2.' + '1'.repeat(300000) + 'x']) {
    assert.notEqual(env.eval(`checkY(${JSON.stringify(y)})`), ''); checks++;
}
for (const y of ['', '3', '-3', 'NaN', 'Infinity', '1e-2', '0x1', '1\n', '1\r\n', '1\u0000', '.', '+', '−1', '<img src=x onerror=alert(1)>', '1'.repeat(65)]) {
    assert.notEqual(env.eval(`checkY(${JSON.stringify(y)})`), ''); checks++;
}
assert.equal(env.eval('normalizeY("  -1,5  ")'), '-1.5'); checks++;
const canonicalLong = '0.' + '0'.repeat(62) + '1';
assert.equal(env.eval(`isResult(${JSON.stringify({ ...valid, y: canonicalLong })})`), true); checks++;
for (const raw of ['{broken', '{}', '[null]', JSON.stringify([{ ...valid, y: '<script>' }]), JSON.stringify([{ ...valid, time: 'broken' }]), 'x'.repeat(250001)]) {
    const broken = environment(raw);
    assert.equal(broken.eval('results.length'), 0);
    assert.ok(broken.elements.get('storage-warning').textContent); checks += 2;
}
const quota = environment(null, true);
quota.eval(`results = [${JSON.stringify(valid)}]; saveResults(); renderTable();`);
assert.ok(quota.elements.get('storage-warning').textContent.includes('Не удалось сохранить'));
assert.equal(quota.elements.get('results').rows[0].cells[1].textContent, '-1.5'); checks += 2;
const many = environment(JSON.stringify(Array.from({ length: 510 }, () => valid)));
assert.equal(many.eval('results.length'), 500); checks++;

async function submit(current) {
    current.elements.get('x').value = '1';
    current.elements.get('y').value = '-1,5';
    current.elements.get('r').value = '2';
    await current.elements.get('form').events.submit({ preventDefault() {} });
}
await submit(env);
assert.equal(env.eval('results.length'), 1);
assert.equal(env.elements.get('status').textContent, 'Точка попадает в область.');
assert.equal(env.elements.get('submit').disabled, false);
assert.equal(JSON.parse(env.storage.get(KEY)).length, 1); checks += 4;

const longInput = '2,' + '9'.repeat(300000) + '000';
const longPage = environment();
longPage.context.fetch = async (url, options) => {
    assert.equal(options.body.get('y'), longInput); checks++;
    return { ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ ...valid, y: options.body.get('y') }) };
};
longPage.elements.get('x').value = '1';
longPage.elements.get('r').value = '2';
longPage.elements.get('y').value = longInput;
await longPage.elements.get('form').events.submit({ preventDefault() {} });
assert.equal(longPage.elements.get('results').rows[0].cells[1].textContent, longInput); checks++;
const savedLong = longPage.storage.get(KEY);
assert.ok(savedLong.length > 250000); checks++;
assert.equal(JSON.parse(savedLong)[0].y, longInput); checks++;
const reloadedLong = environment(savedLong);
assert.equal(reloadedLong.elements.get('results').rows[0].cells[1].textContent, longInput); checks++;

for (const [fetch, message] of [
    [async () => { throw new TypeError('Offline'); }, 'Нет связи'],
    [async () => { throw Object.assign(new Error(), { name: 'AbortError' }); }, '12 секунд'],
    [async () => ({ ok: false, status: 503, headers: new Headers({ 'content-type': 'text/html' }) }), 'неожиданный'],
    [async () => ({ ok: false, status: 400, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ error: 'Неверный параметр' }) }), 'Неверный параметр'],
    [async () => ({ ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ ...valid, hit: 'yes' }) }), 'некорректные данные']
]) {
    env.context.fetch = fetch;
    await submit(env);
    assert.ok(env.elements.get('error').textContent.includes(message));
    assert.equal(env.eval('results.length'), 1);
    assert.equal(env.elements.get('submit').disabled, false);
    assert.equal(env.elements.get('clear').disabled, false); checks += 4;
}
let resolveRequest;
let requests = 0;
env.context.fetch = () => { requests++; return new Promise(resolve => { resolveRequest = resolve; }); };
const first = submit(env);
await submit(env);
assert.equal(requests, 1);
assert.equal(env.elements.get('submit').disabled, true); checks += 2;
resolveRequest({ ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ ...valid }) });
await first;
env.elements.get('clear').events.click();
assert.equal(env.eval('results.length'), 0);
assert.equal(JSON.parse(env.storage.get(KEY)).length, 0); checks += 2;
console.log(`PASS: ${checks} проверок JavaScript: точная валидация, повреждённая история, лимит, запрет storage, AJAX, сетевые ошибки и повторная отправка.`);
