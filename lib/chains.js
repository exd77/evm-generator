export const CHAINS = {
  ethereum: {
    name: 'Ethereum',
    chainId: 1,
    symbol: 'ETH',
    rpc: ['https://ethereum.publicnode.com', 'https://rpc.ankr.com/eth', 'https://eth.llamarpc.com'],
    explorer: 'https://etherscan.io',
  },
  base: {
    name: 'Base',
    chainId: 8453,
    symbol: 'ETH',
    rpc: ['https://mainnet.base.org', 'https://base.publicnode.com', 'https://base.llamarpc.com'],
    explorer: 'https://basescan.org',
  },
  bsc: {
    name: 'BNB Smart Chain',
    chainId: 56,
    symbol: 'BNB',
    rpc: ['https://bsc-dataseed.binance.org', 'https://bsc.publicnode.com', 'https://rpc.ankr.com/bsc'],
    explorer: 'https://bscscan.com',
  },
  polygon: {
    name: 'Polygon',
    chainId: 137,
    symbol: 'POL',
    rpc: ['https://polygon-rpc.com', 'https://polygon.publicnode.com', 'https://rpc.ankr.com/polygon'],
    explorer: 'https://polygonscan.com',
  },
  arbitrum: {
    name: 'Arbitrum One',
    chainId: 42161,
    symbol: 'ETH',
    rpc: ['https://arb1.arbitrum.io/rpc', 'https://arbitrum.publicnode.com', 'https://rpc.ankr.com/arbitrum'],
    explorer: 'https://arbiscan.io',
  },
  optimism: {
    name: 'OP Mainnet',
    chainId: 10,
    symbol: 'ETH',
    rpc: ['https://mainnet.optimism.io', 'https://optimism.publicnode.com', 'https://rpc.ankr.com/optimism'],
    explorer: 'https://optimistic.etherscan.io',
  },
  avalanche: {
    name: 'Avalanche C-Chain',
    chainId: 43114,
    symbol: 'AVAX',
    rpc: ['https://api.avax.network/ext/bc/C/rpc', 'https://avalanche-c-chain.publicnode.com'],
    explorer: 'https://snowtrace.io',
  },
  linea: {
    name: 'Linea',
    chainId: 59144,
    symbol: 'ETH',
    rpc: ['https://rpc.linea.build', 'https://linea.publicnode.com'],
    explorer: 'https://lineascan.build',
  },
  scroll: {
    name: 'Scroll',
    chainId: 534352,
    symbol: 'ETH',
    rpc: ['https://rpc.scroll.io', 'https://scroll.publicnode.com'],
    explorer: 'https://scrollscan.com',
  },
  zksync: {
    name: 'zkSync Era',
    chainId: 324,
    symbol: 'ETH',
    rpc: ['https://mainnet.era.zksync.io', 'https://zksync.publicnode.com'],
    explorer: 'https://explorer.zksync.io',
  },
  sepolia: {
    name: 'Sepolia (testnet)',
    chainId: 11155111,
    symbol: 'ETH',
    rpc: ['https://ethereum-sepolia.publicnode.com', 'https://rpc.sepolia.org'],
    explorer: 'https://sepolia.etherscan.io',
  },
  'base-sepolia': {
    name: 'Base Sepolia (testnet)',
    chainId: 84532,
    symbol: 'ETH',
    rpc: ['https://sepolia.base.org', 'https://base-sepolia.publicnode.com'],
    explorer: 'https://sepolia.basescan.org',
  },
};

export function listChains() {
  return Object.entries(CHAINS).map(([key, c]) => ({
    key,
    name: c.name,
    chainId: c.chainId,
    symbol: c.symbol,
    rpc: c.rpc[0],
    explorer: c.explorer,
  }));
}

export function resolveChain(input) {
  if (!input) return null;
  const key = String(input).toLowerCase();
  if (CHAINS[key]) return { key, ...CHAINS[key] };
  const byId = Object.entries(CHAINS).find(([, c]) => String(c.chainId) === key);
  if (byId) return { key: byId[0], ...byId[1] };
  return null;
}

export function explorerTx(chain, hash) {
  if (!chain?.explorer || !hash) return null;
  return `${chain.explorer}/tx/${hash}`;
}

export function explorerAddress(chain, addr) {
  if (!chain?.explorer || !addr) return null;
  return `${chain.explorer}/address/${addr}`;
}
