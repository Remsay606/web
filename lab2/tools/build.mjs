import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));

export function build() {
    mkdirSync(path.join(ROOT, 'build/classes'), { recursive: true });
    mkdirSync(path.join(ROOT, 'build/lib'), { recursive: true });
    copyFileSync(path.join(ROOT, 'lib/fastcgi-lib.jar'), path.join(ROOT, 'build/lib/fastcgi-lib.jar'));
    writeFileSync(path.join(ROOT, 'build/MANIFEST.MF'),
        'Manifest-Version: 1.0\nMain-Class: Main\nClass-Path: lib/fastcgi-lib.jar\n\n');
    for (const [command, args] of [
        ['javac', ['--release', '17', '-encoding', 'UTF-8', '-cp', 'lib/fastcgi-lib.jar', '-d', 'build/classes',
            'src/AreaChecker.java', 'src/RequestHandler.java', 'src/Main.java']],
        ['jar', ['cfm', 'build/lab2.jar', 'build/MANIFEST.MF', '-C', 'build/classes', '.']]
    ]) {
        const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit' });
        if (result.error || result.status !== 0) {
            throw result.error || new Error(`${command}: ошибка сборки. Если приложение уже запущено, остановите его перед пересборкой.`);
        }
    }
    console.log('Собрано: build/lab2.jar');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) build();
