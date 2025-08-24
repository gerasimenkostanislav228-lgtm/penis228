import USDTContracts from '../contracts/USDTContracts.js';

export default {
    LMWR_BASE_CEX: {
        token: 'LMWR',
        buyExchange: ['Bybit'],
        sellExchange: ['OpenOcean'],
        network: 'base',
        buyAmounts: [
            {amount: 200, notificationThreshold: 2},
            {amount: 500, notificationThreshold: 2},

        ],
        inputToken: {
            symbol: 'USDT',
            address: USDTContracts.Base.address,
            decimals: USDTContracts.Base.decimals
        },
        outputToken: {
            symbol: 'LMWR',
            address: '0xE997017e0Cb0CEB503565F181e9ea922CD979c35',
            decimals: 18
        }
    },
    LMWR_BASE_DEX: {
        token: 'LMWR',
        buyExchange: ['OpenOcean'],
        sellExchange: ['Bybit'],
        network: 'base',
        buyAmounts: [
            {amount: 200, notificationThreshold: 2},
            {amount: 500, notificationThreshold: 2},

        ],
        inputToken: {
            symbol: 'USDT',
            address: USDTContracts.Base.address,
            decimals: USDTContracts.Base.decimals
        },
        outputToken: {
            symbol: 'LMWR',
            address: '0xE997017e0Cb0CEB503565F181e9ea922CD979c35',
            decimals: 18
        }
    },
    LMWR_BSC_CEX: {
        token: 'LMWR',
        buyExchange: ['Bybit'],
        sellExchange: ['OpenOcean'],
        network: 'BSC',
        buyAmounts: [
            {amount: 200, notificationThreshold: 2},
            {amount: 500, notificationThreshold: 2},

        ],
        inputToken: {
            symbol: 'USDT',
            address: USDTContracts.BSC.address,
            decimals: USDTContracts.BSC.decimals
        },
        outputToken: {
            symbol: 'LMWR',
            address: '0x307Bc76E3d59ED73886A9cf9360a9286f6281ba7',
            decimals: 18
        }
    },
    LMWR_BSC_DEX: {
        token: 'LMWR',
        buyExchange: ['OpenOcean'],
        sellExchange: ['Bybit'],
        network: 'bsc',
        buyAmounts: [
            {amount: 200, notificationThreshold: 2},
            {amount: 500, notificationThreshold: 2},

        ],
        inputToken: {
            symbol: 'USDT',
            address: USDTContracts.BSC.address,
            decimals: USDTContracts.BSC.decimals
        },
        outputToken: {
            symbol: 'LMWR',
            address: '0x307Bc76E3d59ED73886A9cf9360a9286f6281ba7',
            decimals: 18
        }
    },
    Defi_CEX: {
        token: 'Defi',
        buyExchange: ['Btse'],
        sellExchange: ['OpenOcean'],
        network: 'bsc',
        buyAmounts: [
            {amount: 100, notificationThreshold: 2},

        ],
        inputToken: {
            symbol: 'USDT',
            address: USDTContracts.BSC.address,
            decimals: USDTContracts.BSC.decimals
        },
        outputToken: {
            symbol: 'Defi',
            address: '0x6d106c0b8d2f47c5465bdbd58d1be253762cbbc1',
            decimals: 18
        }
    },
    Defi_DEX: {
        token: 'Defi',
        buyExchange: ['OpenOcean'],
        sellExchange: ['Btse'],
        network: 'bsc',
        buyAmounts: [
            {amount: 100, notificationThreshold: 2},

        ],
        inputToken: {
            symbol: 'USDT',
            address: USDTContracts.BSC.address,
            decimals: USDTContracts.BSC.decimals
        },
        outputToken: {
            symbol: 'Defi',
            address: '0x6d106c0b8d2f47c5465bdbd58d1be253762cbbc1',
            decimals: 18
        }
    },
    BTSE_eth_CEX: {
        token: 'BTSE',
        buyExchange: ['Btse'],
        sellExchange: ['Odos'],
        network: 'Ethereum',
        buyAmounts: [
            {amount: 500, notificationThreshold: 2},
            {amount: 1000, notificationThreshold: 2},

        ],
        inputToken: {
            symbol: 'USDT',
            address: USDTContracts.Ethereum.address,
            decimals: USDTContracts.Ethereum.decimals
        },
        outputToken: {
            symbol: 'BTSE',
            address: '0x666d875c600aa06ac1cf15641361dec3b00432ef',
            decimals: 8
        }
    },
    BTSE_eth_DEX: {
        token: 'BTSE',
        buyExchange: ['Odos'],
        sellExchange: ['Btse'],
        network: 'Ethereum',
        buyAmounts: [
            {amount: 250, notificationThreshold: 2},
            {amount: 500, notificationThreshold: 2},

        ],
        inputToken: {
            symbol: 'USDT',
            address: USDTContracts.Ethereum.address,
            decimals: USDTContracts.Ethereum.decimals
        },
        outputToken: {
            symbol: 'BTSE',
            address: '0x666d875c600aa06ac1cf15641361dec3b00432ef',
            decimals: 8
        }
    },
    BTSE_bsc_CEX: {
        token: 'BTSE',
        buyExchange: ['Btse'],
        sellExchange: ['OpenOcean'],
        network: 'bsc',
        buyAmounts: [
            {amount: 500, notificationThreshold: 2},
            {amount: 1000, notificationThreshold: 2},

        ],
        inputToken: {
            symbol: 'USDT',
            address: USDTContracts.BSC.address,
            decimals: USDTContracts.BSC.decimals
        },
        outputToken: {
            symbol: 'BTSE',
            address: '0xa208E10D55E13E0ae0871623629DA9563EEA24e2',
            decimals: 8
        }
    },
    BTSE_bsc_DEX: {
        token: 'BTSE',
        buyExchange: ['OpenOcean'],
        sellExchange: ['Btse'],
        network: 'bsc',
        buyAmounts: [
            {amount: 250, notificationThreshold: 2},
            {amount: 500, notificationThreshold: 2},

        ],
        inputToken: {
            symbol: 'USDT',
            address: USDTContracts.BSC.address,
            decimals: USDTContracts.BSC.decimals
        },
        outputToken: {
            symbol: 'BTSE',
            address: '0xa208E10D55E13E0ae0871623629DA9563EEA24e2',
            decimals: 8
        }
    },
    Ent_CEX: {
        token: 'ENT',
        buyExchange: ['Btse'],
        sellExchange: ['OpenOcean'],
        network: 'bsc',
        buyAmounts: [
            {amount: 25, notificationThreshold: 2},

        ],
        inputToken: {
            symbol: 'USDT',
            address: USDTContracts.BSC.address,
            decimals: USDTContracts.BSC.decimals
        },
        outputToken: {
            symbol: 'ENT',
            address: '0x5110922ac1fe18f16c77c1da7a9a65d98a540040',
            decimals: 18
        }
    },
    Ent_DEX: {
        token: 'ENT',
        buyExchange: ['OpenOcean'],
        sellExchange: ['Btse'],
        network: 'bsc',
        buyAmounts: [
            {amount: 25, notificationThreshold: 2},

        ],
        inputToken: {
            symbol: 'USDT',
            address: USDTContracts.BSC.address,
            decimals: USDTContracts.BSC.decimals
        },
        outputToken: {
            symbol: 'ENT',
            address: '0x5110922ac1fe18f16c77c1da7a9a65d98a540040',
            decimals: 18
        }
    },
    Vext_eth_CEX: {
        token: 'VEXT',
        buyExchange: ['Btse'],
        sellExchange: ['OpenOcean'],
        network: 'eth',
        buyAmounts: [
            {amount: 100, notificationThreshold: 2},

        ],
        inputToken: {
            symbol: 'USDT',
            address: USDTContracts.Ethereum.address,
            decimals: USDTContracts.Ethereum.decimals
        },
        outputToken: {
            symbol: 'VEXT',
            address: '0xB2492E97a68a6E4B9E9a11B99F6C42E5aCCD38c7',
            decimals: 18
        }
    },
    Vext_eth_DEX: {
        token: 'VEXT',
        buyExchange: ['OpenOcean'],
        sellExchange: ['Btse'],
        network: 'eth',
        buyAmounts: [
            {amount: 100, notificationThreshold: 2},

        ],
        inputToken: {
            symbol: 'USDT',
            address: USDTContracts.Ethereum.address,
            decimals: USDTContracts.Ethereum.decimals
        },
        outputToken: {
            symbol: 'VEXT',
            address: '0xB2492E97a68a6E4B9E9a11B99F6C42E5aCCD38c7',
            decimals: 18
        }
    },
    Vext_pol_CEX: {
        token: 'VEXT',
        buyExchange: ['Btse'],
        sellExchange: ['OpenOcean'],
        network: 'polygon',
        buyAmounts: [
            {amount: 100, notificationThreshold: 2},

        ],
        inputToken: {
            symbol: 'USDT',
            address: USDTContracts.Polygon.address,
            decimals: USDTContracts.Polygon.decimals
        },
        outputToken: {
            symbol: 'VEXT',
            address: '0x27842334C55c01DDFE81Bf687425F906816c5141',
            decimals: 18
        }
    },
    Vext_pol_DEX: {
        token: 'VEXT',
        buyExchange: ['OpenOcean'],
        sellExchange: ['Btse'],
        network: 'polygon',
        buyAmounts: [
            {amount: 100, notificationThreshold: 2},

        ],
        inputToken: {
            symbol: 'USDT',
            address: USDTContracts.Polygon.address,
            decimals: USDTContracts.Polygon.decimals
        },
        outputToken: {
            symbol: 'VEXT',
            address: '0x27842334C55c01DDFE81Bf687425F906816c5141',
            decimals: 18
        }
    },
    SWCH_CEX: {
        token: 'SWCH',
        buyExchange: ['Bitget', 'Mexc', 'Gate'],
        sellExchange: ['OpenOcean'],
        network: 'polygon',
        buyAmounts: [
            {amount: 100, notificationThreshold: 3},
            {amount: 250, notificationThreshold: 3},
            {amount: 500, notificationThreshold: 3},
            {amount: 1000, notificationThreshold: 3},

        ],
        inputToken: {
            symbol: 'USDT',
            address: USDTContracts.Polygon.address,
            decimals: USDTContracts.Polygon.decimals
        },
        outputToken: {
            symbol: 'SWCH',
            address: '0x3ce1327867077b551ae9a6987bf10c9fd08edce1',
            decimals: 18
        }
    },
    SWCH_DEX: {
        token: 'SWCH',
        buyExchange: ['OpenOcean'],
        sellExchange: ['Bitget', 'Mexc', 'Gate'],
        network: 'polygon',
        buyAmounts: [
            {amount: 100, notificationThreshold: 3},
            {amount: 250, notificationThreshold: 3},
            {amount: 500, notificationThreshold: 3},
            {amount: 1000, notificationThreshold: 3},



        ],
        inputToken: {
            symbol: 'USDT',
            address: USDTContracts.Polygon.address,
            decimals: USDTContracts.Polygon.decimals
        },
        outputToken: {
            symbol: 'SWCH',
            address: '0x3ce1327867077b551ae9a6987bf10c9fd08edce1',
            decimals: 18
        }
    },
    SPEC_CEX: {
        token: 'SPEC',
        buyExchange: ['Bybit'],
        sellExchange: ['OpenOcean'],
        network: 'eth',
        buyAmounts: [
            {amount: 500, notificationThreshold: 2},
            {amount: 1000, notificationThreshold: 2},

        ],
        inputToken: {
            symbol: 'USDT',
            address: USDTContracts.Ethereum.address,
            decimals: USDTContracts.Ethereum.decimals
        },
        outputToken: {
            symbol: 'SPEC',
            address: '0xadf7c35560035944e805d98ff17d58cde2449389',
            decimals: 18
        }
    },
    SPEC_DEX: {
        token: 'SPEC',
        buyExchange: ['OpenOcean'],
        sellExchange: ['Bybit'],
        network: 'eth',
        buyAmounts: [
            {amount: 500, notificationThreshold: 2},
            {amount: 1000, notificationThreshold: 2},

        ],
        inputToken: {
            symbol: 'USDT',
            address: USDTContracts.Ethereum.address,
            decimals: USDTContracts.Ethereum.decimals
        },
        outputToken: {
            symbol: 'SPEC',
            address: '0xadf7c35560035944e805d98ff17d58cde2449389',
            decimals: 18
        }
    }
}
