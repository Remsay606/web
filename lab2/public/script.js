'use strict';

const X_VALUES = ['-3', '-2', '-1', '0', '1', '2', '3', '4', '5'];
const R_VALUES = ['1', '1.5', '2', '2.5', '3'];
const STORAGE_KEY = 'lab2-53566-results-v1';
const MAX_RESULTS = 500;
const form = document.getElementById('form');
const xSelect = document.getElementById('x');
const yInput = document.getElementById('y');
const rSelect = document.getElementById('r');
const errorBox = document.getElementById('error');
const statusBox = document.getElementById('status');
const storageWarning = document.getElementById('storage-warning');
const submitButton = document.getElementById('submit');
const clearButton = document.getElementById('clear');
const tableBody = document.getElementById('results');
const canvas = document.getElementById('plane');
const ctx = canvas.getContext('2d');
const CENTER = 200;
const UNIT = 140;
const dateFormat = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'medium' });
let pending = false;

function normalizeY(value) {
    return value.replace(/^ +| +$/g, '').replace(',', '.');
}

function checkY(value) {
    const y = normalizeY(value);
    if (y === '') return 'Введите Y.';
    if (/[\r\n]/.test(y) || !/^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$/.test(y)) {
        return 'Y: введите десятичное число с точкой или запятой.';
    }
    // Для |Y| < 3 достаточно целой части: любое 2.999… допустимо, 3.000… — нет.
    // Работаем со строкой, поэтому дробь любой длины не округляется до 3.
    const whole = y.replace(/^[+-]/, '').split('.')[0].replace(/^0+/, '') || '0';
    return whole.length > 1 || whole > '2' ? 'Y должен быть строго больше -3 и строго меньше 3.' : '';
}

function isResult(item) {
    return item !== null && typeof item === 'object'
        && X_VALUES.includes(item.x) && R_VALUES.includes(item.r)
        && typeof item.y === 'string' && checkY(item.y) === ''
        && typeof item.hit === 'boolean'
        && typeof item.time === 'string' && Number.isFinite(Date.parse(item.time))
        && Number.isSafeInteger(item.elapsedMicros) && item.elapsedMicros >= 0;
}

function loadResults() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === null) return [];
        const saved = JSON.parse(raw);
        if (!Array.isArray(saved)) throw new Error('Invalid history');
        const valid = saved.slice(-MAX_RESULTS).filter(isResult);
        if (valid.length !== saved.length) storageWarning.textContent = 'Некорректные или лишние записи истории пропущены.';
        return valid;
    } catch {
        storageWarning.textContent = 'История недоступна или повреждена. Новые проверки работают; сохранение зависит от настроек браузера.';
        return [];
    }
}

function saveResults() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(results));
        storageWarning.textContent = '';
    } catch {
        storageWarning.textContent = 'Не удалось сохранить историю: хранилище заполнено или недоступно. История доступна до закрытия или перезагрузки страницы.';
    }
}

function renderTable() {
    tableBody.replaceChildren();
    if (results.length === 0) {
        const cell = tableBody.insertRow().insertCell();
        cell.colSpan = 6;
        cell.textContent = 'Проверок пока нет.';
        return;
    }
    for (const result of [...results].reverse()) {
        const row = tableBody.insertRow();
        const cells = [result.x, result.y, result.r, result.hit ? 'Попадание' : 'Промах',
            dateFormat.format(new Date(result.time)), result.elapsedMicros];
        for (const text of cells) row.insertCell().textContent = text;
        row.cells[3].dataset.hit = result.hit ? 'yes' : 'no';
    }
}

function drawPlane() {
    if (!ctx) return; // Отсутствие canvas не мешает проверять точки и видеть таблицу.
    const r = rSelect.value;
    const radius = R_VALUES.includes(r) ? Number(r) : 1;
    const points = results.filter(item => item.r === r);
    // Область и все точки выбранного R помещаются с запасом до края холста.
    const extent = Math.max(radius, ...points.map(item =>
        Math.ceil(Math.max(Math.abs(Number(item.x)), Math.abs(Number(normalizeY(item.y)))))));
    const scale = UNIT / extent;
    const areaSize = radius * scale;
    ctx.clearRect(0, 0, 400, 400);
    ctx.fillStyle = '#3399ff';
    ctx.beginPath();
    ctx.moveTo(CENTER, CENTER);
    ctx.arc(CENTER, CENTER, areaSize, -Math.PI / 2, 0);
    ctx.closePath();
    ctx.moveTo(CENTER, CENTER);
    ctx.lineTo(CENTER - areaSize / 2, CENTER);
    ctx.lineTo(CENTER, CENTER - areaSize / 2);
    ctx.closePath();
    ctx.rect(CENTER, CENTER, areaSize / 2, areaSize);
    ctx.fill();

    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(15, CENTER); ctx.lineTo(385, CENTER);
    ctx.moveTo(CENTER, 385); ctx.lineTo(CENTER, 15);
    ctx.moveTo(378, CENTER - 4); ctx.lineTo(385, CENTER); ctx.lineTo(378, CENTER + 4);
    ctx.moveTo(CENTER - 4, 22); ctx.lineTo(CENTER, 15); ctx.lineTo(CENTER + 4, 22);
    ctx.stroke();
    ctx.fillStyle = '#222';
    ctx.font = '13px Arial';
    ctx.fillText('x', 383, CENTER - 12);
    ctx.fillText('y', CENTER + 10, 18);
    ctx.fillText('0', CENTER - 13, CENTER + 16);
    for (const [k, relativeLabel] of [[1, 'R'], [0.5, 'R/2'], [-0.5, '−R/2'], [-1, '−R']]) {
        const label = extent === radius ? relativeLabel : String(k * extent);
        const shift = k * UNIT;
        ctx.fillRect(CENTER + shift, CENTER - 3, 1, 6);
        ctx.fillRect(CENTER - 3, CENTER - shift, 6, 1);
        ctx.fillText(label, CENTER + shift - 12, CENTER - 10);
        ctx.fillText(label, CENTER + 9, CENTER - shift + 4);
    }
    const note = document.getElementById('graph-note');
    if (!R_VALUES.includes(r)) {
        note.textContent = 'Выберите R для отображения точек. Границы области включены.';
        return;
    }
    for (const result of points) {
        const px = CENTER + Number(result.x) * scale;
        const py = CENTER - Number(normalizeY(result.y)) * scale;
        ctx.fillStyle = result.hit ? '#22662d' : '#b21f2d';
        ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill();
    }
    note.textContent = `R = ${r}. Масштаб осей: от −${extent} до ${extent}. Показаны все проверки с этим R: зелёный — попадание, красный — промах.`;
}

let results = loadResults();

form.addEventListener('submit', async event => {
    event.preventDefault();
    if (pending) return;
    const x = xSelect.value;
    // Сохраняем все цифры, запятую/точку и конечные нули; убираем только крайние пробелы.
    const y = yInput.value.replace(/^ +| +$/g, '');
    const r = rSelect.value;
    const xError = X_VALUES.includes(x) ? '' : 'Выберите X из списка.';
    const yError = checkY(y);
    const rError = R_VALUES.includes(r) ? '' : 'Выберите R из списка.';
    for (const [element, error] of [[xSelect, xError], [yInput, yError], [rSelect, rError]]) {
        element.setAttribute('aria-invalid', String(Boolean(error)));
    }
    errorBox.textContent = [xError, yError, rError].filter(Boolean).join('\n');
    statusBox.textContent = '';
    if (xError || yError || rError) return;

    pending = true;
    submitButton.disabled = true;
    clearButton.disabled = true;
    statusBox.textContent = 'Проверяем…';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
        const response = await fetch(form.action, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
            body: new URLSearchParams({ x, y, r }),
            signal: controller.signal,
            cache: 'no-store'
        });
        if (!response.headers.get('content-type')?.includes('application/json')) {
            throw new Error(`Сервер вернул неожиданный ответ (HTTP ${response.status}). Проверьте запуск сервера.`);
        }
        const result = await response.json();
        if (!response.ok) throw new Error(typeof result?.error === 'string' ? result.error : `Ошибка сервера: HTTP ${response.status}.`);
        if (!isResult(result) || result.x !== x || result.r !== r) throw new Error('Сервер вернул некорректные данные.');
        results.push(result);
        results = results.slice(-MAX_RESULTS);
        saveResults();
        renderTable();
        drawPlane();
        statusBox.textContent = result.hit ? 'Точка попадает в область.' : 'Точка не попадает в область.';
    } catch (error) {
        statusBox.textContent = '';
        errorBox.textContent = error.name === 'AbortError'
            ? 'Сервер не ответил за 12 секунд. Повторите попытку.'
            : error instanceof TypeError ? 'Нет связи с сервером. Проверьте подключение и запуск Java.' : error.message;
    } finally {
        clearTimeout(timeout);
        pending = false;
        submitButton.disabled = false;
        clearButton.disabled = false;
    }
});

clearButton.addEventListener('click', () => {
    if (pending) return;
    results = [];
    saveResults();
    renderTable();
    drawPlane();
    errorBox.textContent = '';
    statusBox.textContent = 'История очищена.';
});
rSelect.addEventListener('change', drawPlane);
window.addEventListener('storage', event => {
    if (event.key === STORAGE_KEY || event.key === null) {
        results = loadResults();
        renderTable();
        drawPlane();
    }
});
renderTable();
drawPlane();
