import com.fastcgi.FCGIInterface;
import com.fastcgi.FCGIRequest;
import java.io.PrintStream;
import java.io.IOException;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Properties;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;

/** FastCGI-приложение. Apache передаёт сюда только динамические запросы. */
public final class Main {
    public static void main(String[] args) throws Exception {
        if (System.getProperty("FCGI_PORT") == null) {
            throw new IllegalArgumentException("Запуск: java -DFCGI_PORT=24001 -jar build/lab2.jar");
        }
        PrintStream log = System.err; // Библиотека затем заменяет System.err потоком FastCGI.
        // Четыре работника могут одновременно обрабатывать четыре разных запроса.
        // Для сравнения можно запустить с -DFCGI_THREADS=1.
        int threads = Integer.parseInt(System.getProperty("FCGI_THREADS", "4"));
        long delay = Long.parseLong(System.getProperty("DEMO_DELAY_MS", "0"));
        if (threads < 1 || threads > 32 || delay < 0 || delay > 5000) {
            throw new IllegalArgumentException("FCGI_THREADS: 1..32; DEMO_DELAY_MS: 0..5000");
        }
        ExecutorService workers = Executors.newFixedThreadPool(threads);
        // Не складываем бесконечное количество подключений в память.
        // Если все работники заняты, новые подключения пока ждут в очереди сокета.
        Semaphore slots = new Semaphore(threads);
        Runtime.getRuntime().addShutdownHook(new Thread(workers::shutdownNow));
        FCGIInterface fastcgi = new FCGIInterface();
        // FastCGI доступен только своему Apache, а не внешним сканерам портов.
        FCGIInterface.startupProps = new Properties(System.getProperties());
        FCGIInterface.srvSocket = new ServerSocket(Integer.parseInt(System.getProperty("FCGI_PORT")),
                50, InetAddress.getByName("127.0.0.1")) {
            @Override
            public Socket accept() throws IOException {
                Socket socket = super.accept();
                socket.setSoTimeout(10000); // Включая чтение заголовков внутри FCGIaccept.
                return socket;
            }
        };
        FCGIInterface.acceptCalled = true;
        FCGIInterface.isFCGI = true;
        while (true) {
            slots.acquire();
            // Только главный поток вызывает FCGIaccept: сама библиотека хранит
            // текущий запрос в общей static-переменной и меняет System.in/out.
            int accepted;
            try {
                accepted = fastcgi.FCGIaccept();
            } catch (RuntimeException exception) {
                // Пустое или оборванное подключение может вызвать ошибку внутри jar.
                // Оно не должно завершать весь сервер.
                log.println("Accept failed: " + exception.getClass().getSimpleName());
                accepted = -1;
            }
            if (accepted < 0) {
                slots.release();
                if (FCGIInterface.srvSocket == null || FCGIInterface.srvSocket.isClosed()) {
                    throw new IllegalStateException("Не удалось открыть FastCGI-порт.");
                }
                // Ошибка одного соединения не должна останавливать весь процесс.
                if (FCGIInterface.request != null && FCGIInterface.request.socket != null) {
                    FCGIInterface.request.socket.close();
                }
                FCGIInterface.request = null;
                continue;
            }
            FCGIRequest request = FCGIInterface.request;
            // Забираем объект себе. Иначе следующий accept закроет потоки
            // предыдущего запроса, хотя работник ещё отправляет ответ.
            FCGIInterface.request = null;
            workers.execute(() -> {
                try {
                    process(request, delay, log);
                } finally {
                    slots.release();
                }
            });
        }
    }

    private static void process(FCGIRequest request, long delay, PrintStream log) {
        String worker = Thread.currentThread().getName();
        long started = System.nanoTime();
        log.println(worker + " START");
        try {
            // Это только демонстрация долгой работы. По умолчанию задержка нулевая.
            // Спит один работник; остальные могут обслуживать другие запросы.
            Thread.sleep(delay);
            RequestHandler.Response response = RequestHandler.handle(request.params, request.inStream);
            send(request, response);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
        } catch (Exception exception) {
            log.println(worker + " ERROR: " + exception.getClass().getSimpleName());
            try {
                send(request, RequestHandler.error(500, "Не удалось обработать запрос. Повторите попытку."));
            } catch (IOException ignored) { }
        } finally {
            // Закрываем именно этот ответ. Библиотека добавит END_REQUEST,
            // когда закрыты оба выходных потока. Сокет завершается здесь же.
            try { request.outStream.close(); } catch (IOException ignored) { }
            try { request.errStream.close(); } catch (IOException ignored) { }
            try { request.socket.close(); } catch (IOException ignored) { }
            log.println(worker + " END " + (System.nanoTime() - started) / 1_000_000 + " ms");
        }
    }

    private static void send(FCGIRequest request, RequestHandler.Response response) throws IOException {
        byte[] body = response.json().getBytes(StandardCharsets.UTF_8);
        String reason = switch (response.status()) {
            case 200 -> "OK";
            case 400 -> "Bad Request";
            case 405 -> "Method Not Allowed";
            case 415 -> "Unsupported Media Type";
            default -> "Internal Server Error";
        };
        String headers = "Status: " + response.status() + " " + reason + "\r\n"
                + "Content-Type: application/json; charset=UTF-8\r\n"
                + "Content-Length: " + body.length + "\r\n"
                + "Cache-Control: no-store\r\n"
                + "X-Content-Type-Options: nosniff\r\n"
                + (response.status() == 405 ? "Allow: POST\r\n" : "") + "\r\n";
        // System.out общий для всей JVM. Если писать туда из работников,
        // ответы разных людей могут перепутаться. У каждого запроса свой outStream.
        request.outStream.write(headers.getBytes(StandardCharsets.US_ASCII));
        request.outStream.write(body);
        request.outStream.flush();
    }
}
