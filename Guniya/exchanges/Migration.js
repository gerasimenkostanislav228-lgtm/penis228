// src/exchanges/Migration.js
export default class Migration {
    constructor(multiplier = 1) {
        this.name = 'Migration';
        this.multiplier = multiplier;
    }

    async processing(pair, amountHuman) {
        // просто множимо токени на коефіцієнт
        return amountHuman * this.multiplier;
    }

    setProxy(_) {
        // нічого не робимо — проксі не потрібно
    }
}
