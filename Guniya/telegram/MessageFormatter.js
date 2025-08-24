// src/telegram/MessageFormatter.js

/**
 * Форматує основне повідомлення для Telegram
 * @param {Object} params
 * @param {string} params.token
 * @param {number} params.profitUSDT
 * @param {number} params.profitPercent
 * @param {number} params.inputAmount
 * @param {string} params.inputSymbol
 * @param {number} params.boughtAmount
 * @param {string} params.outputSymbol
 * @param {number} params.soldUSDT
 * @param {string} params.buyExchange
 * @param {string} params.sellExchange
 * @returns {string}
 */
export function formatMainMessage({
                                      token,
                                      profitUSDT,
                                      profitPercent,
                                      inputAmount,
                                      inputSymbol,
                                      boughtAmount,
                                      outputSymbol,
                                      soldUSDT,
                                      buyExchange,
                                      sellExchange
                                  }) {
    return (
        `${token} - Повідомлення!\n` +
        `Прибуток: ${profitUSDT.toFixed(2)} USDT (${profitPercent.toFixed(2)}%)\n` +
        `Куплено: ${inputAmount.toFixed(2)} ${inputSymbol} -> ${boughtAmount.toFixed(2)} ${outputSymbol}\n` +
        `Отримано: ${soldUSDT.toFixed(2)} USDT\n` +
        `Біржі: купівля на ${buyExchange}, продаж на ${sellExchange}`
    );
}

/**
 * Форматує лог‑повідомлення для Telegram
 * @param {Object} params
 * @param {string} params.scenario
 * @param {string} params.token
 * @param {number} params.inputAmount
 * @param {string} params.inputSymbol
 * @param {number} params.boughtAmount
 * @param {string} params.outputSymbol
 * @param {number} params.soldUSDT
 * @param {number} params.profitUSDT
 * @param {number} params.profitPercent
 * @param {string} params.buyExchange
 * @param {string} params.sellExchange
 * @returns {string}
 */
export function formatLogMessage({
                                     scenario,
                                     token,
                                     inputAmount,
                                     inputSymbol,
                                     boughtAmount,
                                     outputSymbol,
                                     soldUSDT,
                                     profitUSDT,
                                     profitPercent,
                                     buyExchange,
                                     sellExchange
                                 }) {
    return (
        `Сценарій: ${scenario}\n` +
        `Токен: ${token}\n` +
        `Сума: ${inputAmount.toFixed(2)} ${inputSymbol}\n` +
        `Куплено: ${boughtAmount.toFixed(2)} ${outputSymbol} на ${buyExchange}\n` +
        `Продаж: ${soldUSDT.toFixed(2)} USDT на ${sellExchange}\n` +
        `Прибуток: ${profitUSDT.toFixed(2)} USDT (${profitPercent.toFixed(2)}%)`
    );
}