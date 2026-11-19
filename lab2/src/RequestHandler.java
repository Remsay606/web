import java.io.IOException;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Properties;
import java.util.Set;

/** Один HTTP-запрос: проверка протокола, параметров и формирование JSON. */
public final class RequestHandler {
    private static final Set<String> X_VALUES = Set.of("-3", "-2", "-1", "0", "1", "2", "3", "4", "5");
    private static final Set<String> R_VALUES = Set.of("1", "1.5", "2", "2.5", "3");
    private static final BigDecimal THREE = BigDecimal.valueOf(3);

    private RequestHandler() { }

    public record Response(int status, String json) { }

    public static Response handle(Properties params, InputStream input) throws IOException {
        long started = System.nanoTime();
        if (!"POST".equals(params.getProperty("REQUEST_METHOD"))) {
            return error(405, "Допустим только POST-запрос.");
        }
        if (!params.getProperty("QUERY_STRING", "").isEmpty()) {
            return error(400, "Передавайте параметры только в теле запроса.");
        }
        String type = params.getProperty("CONTENT_TYPE", "").split(";", 2)[0].trim();
        if (!type.equalsIgnoreCase("application/x-www-form-urlencoded")) {
            return error(415, "Требуется application/x-www-form-urlencoded.");
        }
        String lengthText = params.getProperty("CONTENT_LENGTH", "");
        if (!lengthText.matches("[0-9]+")) {
            return error(400, "Некорректная длина запроса.");
        }
        // Читаем до конца FastCGI STDIN без ограничения количества цифр в Y.
        // Выданная FastCGI-библиотека иногда возвращает 0 вместо -1 при обрыве.
        // readAllBytes() в таком случае зацикливается; читаем явно до <= 0.
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int count;
        while ((count = input.read(buffer)) > 0) {
            body.write(buffer, 0, count);
        }
        byte[] bytes = body.toByteArray();
        if (!new BigInteger(lengthText).equals(BigInteger.valueOf(bytes.length))) {
            return error(400, "Длина тела не совпадает с CONTENT_LENGTH.");
        }
        try {
            Map<String, String> fields = parseForm(new String(bytes, StandardCharsets.UTF_8));
            String x = fields.get("x");
            String originalY = fields.get("y").replaceAll("^ +| +$", "");
            String y = originalY.replace(',', '.');
            String r = fields.get("r");
            if (!X_VALUES.contains(x)) {
                return error(400, "X должен быть целым числом из списка от -3 до 5.");
            }
            if (!R_VALUES.contains(r)) {
                return error(400, "R должен быть выбран из списка: 1, 1.5, 2, 2.5, 3.");
            }
            if (!y.matches("[+-]?(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)")) {
                return error(400, "Y: введите десятичное число с точкой или запятой.");
            }
            BigDecimal valueY = new BigDecimal(y);
            if (valueY.compareTo(THREE.negate()) <= 0 || valueY.compareTo(THREE) >= 0) {
                return error(400, "Y должен быть строго больше -3 и строго меньше 3.");
            }
            boolean hit = AreaChecker.contains(new BigDecimal(x), valueY, new BigDecimal(r));
            long elapsedMicros = (System.nanoTime() - started) / 1000;
            // В ответ попадают только проверенные числа, boolean и время, не сырой ввод.
            String json = "{\"x\":\"" + x + "\",\"y\":\"" + originalY
                    + "\",\"r\":\"" + r + "\",\"hit\":" + hit
                    + ",\"time\":\"" + Instant.now() + "\",\"elapsedMicros\":" + elapsedMicros + "}";
            return new Response(200, json);
        } catch (IllegalArgumentException exception) {
            return error(400, "Некорректная форма: нужны ровно по одному параметру x, y, r.");
        }
    }

    private static Map<String, String> parseForm(String body) {
        Map<String, String> fields = new HashMap<>();
        String[] pairs = body.split("&", -1);
        if (pairs.length != 3) {
            throw new IllegalArgumentException("Expected three fields");
        }
        for (String pair : pairs) {
            String[] parts = pair.split("=", 2);
            if (parts.length != 2) {
                throw new IllegalArgumentException("Missing equals sign");
            }
            String key = URLDecoder.decode(parts[0], StandardCharsets.UTF_8);
            String value = URLDecoder.decode(parts[1], StandardCharsets.UTF_8);
            if (!Set.of("x", "y", "r").contains(key) || fields.putIfAbsent(key, value) != null) {
                throw new IllegalArgumentException("Unknown or duplicate field");
            }
        }
        return fields;
    }

    public static Response error(int status, String message) {
        // Вызывается только с постоянными сообщениями из программы.
        return new Response(status, "{\"error\":\"" + message + "\"}");
    }
}
