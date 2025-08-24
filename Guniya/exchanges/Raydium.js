import axios from 'axios';
import Bottleneck from 'bottleneck';

class Raydium {
    constructor() {
        this.host = 'https://transaction-v1.raydium.io';
        this.txVersion = 'V0';
        this.slippageBps = 50;
        this.limiter = new Bottleneck({ maxConcurrent: 1, minTime: 250 });
    }

    async getQuote(inputMint, outputMint, amountLamports) {
        const url = `${this.host}/compute/swap-base-in` +
            `?inputMint=${inputMint}` +
            `&outputMint=${outputMint}` +
            `&amount=${amountLamports}` +
            `&slippageBps=${this.slippageBps}` +
            `&txVersion=${this.txVersion}`;

        try {
            return await this.limiter.schedule(() => axios.get(url).then(r => r.data));
        } catch (e) {
            console.error('Raydium getQuote error:', e.message);
            return null;
        }
    }

    async processing(pair, amount, proxy, uniqueId, network) {
        if (network !== 'solana') {
            console.error(`Raydium only supports Solana, got: ${network}`);
            return null;
        }

        try {
            const decimals = pair.input.decimals;
            const amountLamports = BigInt(Math.floor(amount * 10 ** decimals));
            const quote = await this.getQuote(pair.input.address, pair.output.address, amountLamports);

            if (!quote?.success) {
                console.error(`Raydium quote failed for ${uniqueId}:`, quote?.msg);
                return null;
            }

            const output = BigInt(quote.data.outputAmount);
            return Number(output) / 10 ** pair.output.decimals;

        } catch (e) {
            console.error(`Raydium processing error (${uniqueId}):`, e.message);
            return null;
        }
    }
}

export default Raydium;
