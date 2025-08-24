// src/telegram/telegramKeys.js
// Зберігайте ключі через змінні оточення або в цьому файлі для тестування
export default {
    telegramToken: process.env.TELEGRAM_TOKEN || '7522596224:AAE1_1CpOFnqc3IRS3KAnVUxTTEIPOIgcV0', // АПІ бота
    chatId: process.env.TELEGRAM_CHAT_ID || '-4701383540',    // основна група для повідомлень
    logChatId: process.env.TELEGRAM_LOG_CHAT_ID || '-4781756613' // група для логів
};
