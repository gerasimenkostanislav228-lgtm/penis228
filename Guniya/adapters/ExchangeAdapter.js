// src/adapters/ExchangeAdapter.js
class ExchangeAdapter {
    adaptSymbol(symbol, exchange) {
        const s = symbol.toUpperCase();
        switch (exchange) {
            case 'Bybit':    return `${s}USDT`;
            case 'Gate':     return `${s}_USDT`;
            case 'Odos':     return s;
            case 'Mexc':     return `${s}USDT`;
            case 'Kucoin':   return `${s}-USDT`;
            case 'Btse':     return `${s}-USDT`;
            case 'Bitget':   return `${s}USDT`;
            case 'Bitmart':  return `${s}_USDT`;
            case 'CryptoCom':return `${s}_USD`;
            case 'Kraken': return `${s}USD`;
            case 'Binance': return `${s}USDT`;
            case 'Okx':    return `${s}-USDT`;
            case 'Coinex': return `${s}USDT`;

            default: throw new Error(`Unknown exchange: ${exchange}`);
        }
    }
}
export default new ExchangeAdapter();
