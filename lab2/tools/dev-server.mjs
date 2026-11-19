// Локальная замена Apache для проверки на Windows. Java всё равно получает FastCGI.
import http from 'node:http';
import net from 'node:net';
import { readFile } from 'node:fs/promises';
import { ROOT } from './build.mjs';
import path from 'node:path';

function record(type, content = Buffer.alloc(0)) {
    const header = Buffer.alloc(8);
    header[0] = 1; header[1] = type;
    header.writeUInt16BE(1, 2);
    header.writeUInt16BE(content.length, 4);
    return Buffer.concat([header, content]);
}

function records(type, content) {
    const result = [];
    // 65535 — предел одной записи протокола FastCGI, а не всего запроса.
    for (let offset = 0; offset < content.length; offset += 65535) {
        result.push(record(type, content.subarray(offset, offset + 65535)));
    }
    return result;
}

function encodeLength(length) {
    if (length < 128) return Buffer.from([length]);
    const result = Buffer.alloc(4);
    result.writeUInt32BE((length | 0x80000000) >>> 0);
    return result;
}

export function fastcgiRequest(params, body, port) {
    return new Promise((resolve, reject) => {
        const socket = net.createConnection({ host: '127.0.0.1', port });
        let pending = Buffer.alloc(0);
        const output = [];
        let finished = false;
        function fail(error) { finished = true; socket.destroy(); reject(error); }
        socket.setTimeout(10000, () => fail(new Error('FastCGI timeout')));
        socket.on('error', fail);
        socket.on('end', () => { if (!finished) fail(new Error('Incomplete FastCGI response')); });
        socket.on('connect', () => {
            const entries = Object.entries(params).map(([key, value]) => {
                const name = Buffer.from(key);
                const data = Buffer.from(String(value));
                return Buffer.concat([encodeLength(name.length), encodeLength(data.length), name, data]);
            });
            const begin = Buffer.alloc(8);
            begin.writeUInt16BE(1); // Роль RESPONDER, keep-connection выключен.
            socket.write(Buffer.concat([record(1, begin), ...records(4, Buffer.concat(entries)), record(4),
                ...records(5, body), record(5)]));
        });
        socket.on('data', data => {
            pending = Buffer.concat([pending, data]);
            while (pending.length >= 8) {
                const length = pending.readUInt16BE(4);
                const size = 8 + length + pending[6];
                if (pending.length < size) break;
                const type = pending[1];
                if (type === 6) {
                    output.push(pending.subarray(8, 8 + length));
                }
                pending = pending.subarray(size);
                if (type === 3) {
                    finished = true;
                    socket.destroy();
                    resolve(Buffer.concat(output));
                    return;
                }
            }
        });
    });
}

export function createDevServer(fcgiPort = 24001) {
    const files = new Map([
        ['/', ['index.html', 'text/html; charset=UTF-8']],
        ['/index.html', ['index.html', 'text/html; charset=UTF-8']],
        ['/style.css', ['style.css', 'text/css; charset=UTF-8']],
        ['/script.js', ['script.js', 'text/javascript; charset=UTF-8']]
    ]);
    const server = http.createServer(async (request, response) => {
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.setHeader('Cache-Control', 'no-store');
        function error(code, message) {
            response.writeHead(code, { 'Content-Type': 'application/json; charset=UTF-8' });
            response.end(JSON.stringify({ error: message }));
        }
        try {
            const url = new URL(request.url, 'http://localhost');
            if (url.pathname !== '/api/check') {
                const file = files.get(url.pathname);
                if (!file) { error(404, 'Страница не найдена.'); return; }
                if (!['GET', 'HEAD'].includes(request.method)) { error(405, 'Допустимы GET и HEAD.'); return; }
                const bytes = await readFile(path.join(ROOT, 'public', file[0]));
                response.writeHead(200, { 'Content-Type': file[1], 'Content-Length': bytes.length });
                response.end(request.method === 'HEAD' ? undefined : bytes);
                return;
            }
            const chunks = [];
            for await (const chunk of request) {
                chunks.push(chunk);
            }
            const body = Buffer.concat(chunks);
            const raw = await fastcgiRequest({
                REQUEST_METHOD: request.method,
                CONTENT_TYPE: request.headers['content-type'] || '',
                CONTENT_LENGTH: String(body.length),
                QUERY_STRING: url.search.slice(1),
                SCRIPT_NAME: '/api/check', SERVER_PROTOCOL: 'HTTP/1.1'
            }, body, fcgiPort);
            const end = raw.indexOf('\r\n\r\n');
            if (end === -1) throw new Error('Invalid CGI headers');
            const lines = raw.subarray(0, end).toString('ascii').split('\r\n');
            let status = 200;
            for (const line of lines) {
                const colon = line.indexOf(':');
                const name = line.slice(0, colon);
                const value = line.slice(colon + 1).trim();
                if (name.toLowerCase() === 'status') status = Number.parseInt(value, 10);
                else response.setHeader(name, value);
            }
            response.writeHead(status);
            response.end(raw.subarray(end + 4));
        } catch {
            if (!response.headersSent) error(502, 'Java FastCGI-сервер недоступен.');
            else response.destroy();
        }
    });
    server.requestTimeout = 15000;
    server.headersTimeout = 15000;
    return server;
}
