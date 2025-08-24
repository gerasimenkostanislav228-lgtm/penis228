// src/run.js – запускає лише admin-bot
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

// Емуляція __dirname / __filename для ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Імпортуємо admin-бот (ядро він підніме сам)
await import(
    pathToFileURL(
        path.join(__dirname, 'telegram', 'adminBot.js')
    ).href
    );

console.log('run.js: adminBot ініціалізований');
