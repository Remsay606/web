import java.math.BigDecimal;

/** Геометрия варианта 53566. Границы всех фигур включены. */
public final class AreaChecker {
    private AreaChecker() { }

    public static boolean contains(BigDecimal x, BigDecimal y, BigDecimal r) {
        BigDecimal half = r.divide(BigDecimal.valueOf(2));

        boolean circle = x.signum() >= 0 && y.signum() >= 0
                && x.multiply(x).add(y.multiply(y)).compareTo(r.multiply(r)) <= 0;
        boolean triangle = x.signum() <= 0 && y.signum() >= 0
                && y.subtract(x).compareTo(half) <= 0;
        boolean rectangle = x.signum() >= 0 && x.compareTo(half) <= 0
                && y.signum() <= 0 && y.compareTo(r.negate()) >= 0;

        return circle || triangle || rectangle;
    }
}
