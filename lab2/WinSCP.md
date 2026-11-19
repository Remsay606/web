# Публикация ЛР2 через WinSCP

**Работающая ссылка: https://se.ifmo.ru/~s504568/lab2/**

Развёртывание проверено на Helios 17.11.2026. Туннель для этой ссылки не нужен.

Локальная папка: `C:\Users\Арсен\Desktop\Study\web-prog\web\lab2\helios-upload\`.
Перенеси её содержимое в `/home/studs/s504568/web/lab2/`:
public, build, config, public_html, server.sh и publish.sh.
После обновления файлов выполни в «Команды → Открыть терминал»:

```sh
sh /home/studs/s504568/web/lab2/server.sh
```

Скрипт запускает свой Apache и Java и публикует вход сайта в
`/home/studs/s504568/public_html/lab2/`. Java нужна версии 17+.
Память Java — 128 МБ, HTTP-порт — 24000, FastCGI — 35481.
Порты читаются из config/httpd.conf, в скрипте их отдельно менять не нужно.

Для демонстрации сбоя останови Java:

```sh
sh /home/studs/s504568/web/lab2/server.sh stop-java
```

Нажми «Проверить» на странице: появится собственное сообщение об ошибке.
Восстанови Java:

```sh
sh /home/studs/s504568/web/lab2/server.sh start-java
```

Повтори проверку: ошибка исчезнет, появится результат без перезагрузки страницы.
Полная остановка: `sh /home/studs/s504568/web/lab2/server.sh stop`.

После изменения исходников пересобери комплект на своём компьютере:

```powershell
node tools/build.mjs
node tools/pack-helios.mjs
```

Перед заменой jar останови Java на Helios. Устройство публичного доступа — в [ГЕЛИОС.md](ГЕЛИОС.md).
