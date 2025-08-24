// src/telegram/errorNotifier.js
import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from '../config/configManager.js';

const TOKEN = '7522596224:AAE1_1CpOFnqc3IRS3KAnVUxTTEIPOIgcV0';
const bot   = new TelegramBot(TOKEN);
const ADMIN_ID = 477547206; // ← твій Telegram user ID

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function sendErrorDM(message) {
    try {
        await bot.sendMessage(ADMIN_ID, message, {
            parse_mode: 'Markdown'
        });
    } catch (err) {
        console.error('❌ Не вдалося надіслати повідомлення в DM:', err.message);
    }
}

// залишаємо, якщо ще хочеш надсилати .json файлом:
export async function sendScenarioErrorFile(scenarioName, proxy, error) {
    const debugData = {
        scenario: scenarioName,
        proxy,
        error: typeof error === 'object' ? (error.stack || error.message) : error
    };

    const tempPath = path.join(__dirname, `../../temp/${scenarioName}-error-log.json`);
    try {
        fs.mkdirSync(path.dirname(tempPath), { recursive: true });
        fs.writeFileSync(tempPath, JSON.stringify(debugData, null, 2));

        await bot.sendDocument(ADMIN_ID, tempPath, {
            caption: `📄 JSON лог для сценарію ${scenarioName}`
        });

        fs.unlinkSync(tempPath);
    } catch (e) {
        console.error('❌ Помилка надсилання JSON-файлу:', e.message);
    }
}

