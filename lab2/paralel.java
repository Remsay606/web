// Пул содержит четыре потока-работника. Они выполняют разные запросы одновременно.
ExecutorService workers = Executors.newFixedThreadPool(4);

// У нас четыре свободных места. Это ограничивает число запросов в обработке.
Semaphore slots = new Semaphore(4);

while (true) {
    // Если все четыре работника заняты, ждём освобождения одного места.
    slots.acquire();

    // Запросы принимает главный поток. Саму библиотеку нельзя одновременно
    // вызывать из нескольких потоков: у неё общая переменная request.
    fastcgi.FCGIaccept();
    FCGIRequest request = FCGIInterface.request;

    // Забираем этот запрос себе. Следующий accept не должен закрыть его потоки,
    // пока работник ещё считает или отправляет ответ.
    FCGIInterface.request = null;

    // execute отдаёт задачу работнику и не ждёт окончания обработки.
    // Главный поток может сразу вернуться к приёму следующего запроса.
    workers.execute(() -> {
        try {
            // Имитация долгой работы. Спит только этот работник.
            // Другие работники в это время могут обрабатывать свои запросы.
            Thread.sleep(2000);

            // У каждого запроса свои параметры и свой входной поток.
            RequestHandler.Response response =
                    RequestHandler.handle(request.params, request.inStream);

            // send пишет именно в request.outStream этого клиента.
            // Использовать общий System.out здесь нельзя: ответы перепутаются.
            send(request, response);
        } catch (InterruptedException exception) {
            // При остановке сервера работника могут попросить прервать ожидание.
            Thread.currentThread().interrupt();
        } catch (Exception exception) {
            log.println("Ошибка обработки: " + exception.getMessage());
        } finally {
            // Завершаем именно этот FastCGI-ответ и закрываем его соединение.
            try { request.outStream.close(); } catch (IOException ignored) { }
            try { request.errStream.close(); } catch (IOException ignored) { }
            try { request.socket.close(); } catch (IOException ignored) { }

            // Возвращаем место даже при ошибке. Можно принять следующий запрос.
            slots.release();
        }
    });
}
