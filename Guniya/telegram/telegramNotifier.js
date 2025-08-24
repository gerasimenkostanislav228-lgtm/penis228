// src/telegram/telegramNotifier.js
import TelegramBot from 'node-telegram-bot-api';
import telegramKeys from './telegramKeys.js';

// Допоміжна функція для розбиття довгого повідомлення на частини
function splitMessage(message, maxLength = 4000) {
    const chunks = [];
    for (let i = 0; i < message.length; i += maxLength) {
        chunks.push(message.slice(i, i + maxLength));
    }
    return chunks;
}

class TelegramNotifier {
    constructor () {
        this.bot       = new TelegramBot(telegramKeys.telegramToken, { polling: false });
        this.chatId    = telegramKeys.chatId;       // основний чат
        this.logChatId = telegramKeys.logChatId;    // лог-чат
    }

    /**
     * Надсилає повідомлення у головний чат.
     * Якщо передати bridgeUrl — додається інлайн-кнопка «Bridge».
     *
     * @param {string} message
     * @param {string|null} bridgeUrl
     */
    async sendMainMessage (message, bridgeUrl = null) {
        try {
            console.log('Відправка повідомлення до основного чату Telegram:\n', message);

            const opts = {};
            if (bridgeUrl) {
                opts.reply_markup = {
                    inline_keyboard: [[{ text: 'Bridge', url: bridgeUrl }]]
                };
            }

            await this.bot.sendMessage(this.chatId, message, opts);
            console.log('Повідомлення відправлено в основний чат!');
        } catch (error) {
            console.error('Помилка відправки основного повідомлення Telegram:', error);
        }
    }

    // Лог-повідомлення (без змін)
    async sendLog (message) {
        try {
            console.log('Відправка лог-повідомлення до Telegram:\n', message);
            const chunks = splitMessage(message, 4000);
            for (const chunk of chunks) {
                await this.bot.sendMessage(this.logChatId, chunk);
            }
            console.log('Лог повідомлення відправлено в групу логів!');
        } catch (error) {
            console.error('Помилка відправки лог-повідомлення Telegram:', error);
        }
    }
}

export default TelegramNotifier;
