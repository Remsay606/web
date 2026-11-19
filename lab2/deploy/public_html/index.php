<?php
// Публичный вход se.ifmo.ru. Страницу и файлы отдаёт наш Apache,
// а проверку точки по-прежнему выполняет Java FastCGI.
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function gatewayError($status, $message) {
    http_response_code($status);
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode(['error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

$prefix = '/~s504568/lab2';
$urlPath = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (strpos($urlPath, $prefix . '/') !== 0) {
    gatewayError(404, 'Страница не найдена.');
}
$path = substr($urlPath, strlen($prefix));
$routes = [
    '/' => '/', '/index.php' => '/', '/index.html' => '/index.html',
    '/style.css' => '/style.css', '/script.js' => '/script.js',
    '/api/check' => '/api/check'
];
if (!isset($routes[$path])) {
    gatewayError(404, 'Страница не найдена.');
}

$method = $_SERVER['REQUEST_METHOD'];
if (!in_array($method, ['GET', 'HEAD', 'POST'], true)) {
    header('Allow: GET, HEAD, POST');
    gatewayError(405, 'Недопустимый метод запроса.');
}
$contentType = str_replace(["\r", "\n"], '', $_SERVER['CONTENT_TYPE'] ?? '');
$query = $_SERVER['QUERY_STRING'] ?? '';
$target = 'http://127.0.0.1:24000' . $routes[$path] . ($query === '' ? '' : '?' . $query);
$context = stream_context_create(['http' => [
    'method' => $method,
    'header' => "Content-Type: $contentType\r\nConnection: close\r\n",
    'content' => file_get_contents('php://input'),
    'timeout' => 10,
    'ignore_errors' => true,
    'follow_location' => 0
]]);
$body = @file_get_contents($target, false, $context);
if ($body === false) {
    gatewayError(502, 'Сервер проверки временно недоступен. Повторите попытку.');
}

$status = 502;
$responseType = 'application/octet-stream';
foreach ($http_response_header as $line) {
    if (preg_match('/^HTTP\/\S+\s+(\d{3})/', $line, $matches)) {
        $status = (int) $matches[1];
    } elseif (stripos($line, 'Content-Type:') === 0) {
        $responseType = trim(substr($line, strlen('Content-Type:')));
    } elseif (stripos($line, 'Allow:') === 0) {
        header($line);
    }
}
if ($path === '/api/check' && stripos($responseType, 'application/json') === false) {
    gatewayError(503, 'Сервер проверки временно недоступен. Повторите попытку.');
}
http_response_code($status);
header('Content-Type: ' . $responseType);
echo $body;
