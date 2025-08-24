// src/exchanges/Hercules.js
// Adapter for Hercules (Metis): Algebra V3 + V2 fallback
// API-compatible with SyncSwap adapter
// Node 18+, ESM, ethers v6

import { ethers } from 'ethers';

class Hercules {
    constructor(options = {}) {
        this.name = 'Hercules';
        this.rpcOverrides = options.rpc || {};

        this.NETWORKS = {
            METIS: {
                label: 'Metis',
                rpc: process.env.METIS_RPC ?? this.rpcOverrides.METIS ?? 'https://andromeda.metis.io/?owner=1088',
                v3Factory: '0xC5BfA92f27dF36d268422EE314a1387bB5ffB06A',
                v3Quoter:  '0xdc2496c72911542a359B9c4d6Fc114c9a392e3D7',
                v2Router:  '0x14679D1Da243B8c7d1A4c6d0523A2Ce614Ef027C',
            },
        };

        this.ERC20_ABI = ['function decimals() view returns (uint8)'];
        this.ALG_FACTORY_ABI = ['function poolByPair(address tokenA, address tokenB) view returns (address)'];
        this.ALG_POOL_ABI = ['function liquidity() view returns (uint128)'];
        this.ALG_QUOTER_ABI = ['function quoteExactInput(bytes path, uint256 amountIn) returns (uint256 amountOut,uint160,uint32,uint256)'];
        this.V2_ROUTER_ABI = ['function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)'];
    }

    setProxy(_proxyUrl) {
        this.proxyUrl = _proxyUrl || null;
    }

    async processing(pair, amountHuman, _proxyUrl, _uuid, _networkHint) {
        try {
            const cfg = this._resolveNetwork(pair?.chain || _networkHint);
            if (!cfg) return 0;
            const provider = this._makeProvider(cfg.rpc);

            const tokenIn  = ethers.getAddress(pair.input.address);
            const tokenOut = ethers.getAddress(pair.output.address);

            const decIn  = await this._ensureDecimals(provider, pair.input);
            const decOut = await this._ensureDecimals(provider, pair.output);

            const amountIn = ethers.parseUnits(String(amountHuman), decIn);

            const [v3, v2] = await Promise.all([
                this._tryV3(cfg, provider, tokenIn, tokenOut, amountIn),
                this._tryV2(cfg, provider, tokenIn, tokenOut, amountIn),
            ]);
            provider.destroy?.();

            const best = this._bestOf([v3, v2]);
            return best ? this._toNumber(best.amountOut, decOut) : 0;
        } catch {
            return 0;
        }
    }

    _resolveNetwork(chainName) {
        if (!chainName) return this.NETWORKS.METIS;
        const s = String(chainName).toLowerCase();
        if (s.includes('metis')) return this.NETWORKS.METIS;
        if (s.includes('andromeda')) return this.NETWORKS.METIS;
        return this.NETWORKS.METIS;
    }

    _makeProvider(rpcUrl) {
        if (!rpcUrl) throw new Error('RPC URL is empty');
        if (rpcUrl.startsWith('ws')) return new ethers.WebSocketProvider(rpcUrl);
        return new ethers.JsonRpcProvider(rpcUrl);
    }

    async _ensureDecimals(provider, token) {
        if (typeof token.decimals === 'number' && token.decimals >= 0) return token.decimals;
        try {
            const c = new ethers.Contract(token.address, this.ERC20_ABI, provider);
            return Number(await c.decimals());
        } catch {
            return 18;
        }
    }

    _bestOf(arr) { let best = null; for (const x of arr) { if (!x) continue; if (!best || x.amountOut > best.amountOut) best = x; } return best; }
    _toNumber(x, dec) { try { return Number(ethers.formatUnits(x, dec)); } catch { return 0; } }
    _packPath(...addresses) { return '0x' + addresses.map(a => a.toLowerCase().replace(/^0x/, '')).join(''); }

    async _tryV3(cfg, provider, tokenIn, tokenOut, amountIn) {
        try {
            const factory = new ethers.Contract(cfg.v3Factory, this.ALG_FACTORY_ABI, provider);
            const pool = await factory.poolByPair(tokenIn, tokenOut);
            if (!pool || pool === ethers.ZeroAddress) return null;

            const L = await new ethers.Contract(pool, this.ALG_POOL_ABI, provider).liquidity();
            if (!L || L === 0n) return null;

            const quoter = new ethers.Contract(cfg.v3Quoter, this.ALG_QUOTER_ABI, provider);
            const path = this._packPath(tokenIn, tokenOut);
            const res = await quoter.quoteExactInput.staticCall(path, amountIn);
            return { version: 'V3', pool, amountOut: res[0] };
        } catch {
            return null;
        }
    }

    async _tryV2(cfg, provider, tokenIn, tokenOut, amountIn) {
        try {
            const router = new ethers.Contract(cfg.v2Router, this.V2_ROUTER_ABI, provider);
            const amounts = await router.getAmountsOut(amountIn, [tokenIn, tokenOut]);
            if (!amounts || amounts.length < 2) return null;
            return { version: 'V2', amountOut: amounts[1] };
        } catch {
            return null;
        }
    }
}

export default Hercules;
