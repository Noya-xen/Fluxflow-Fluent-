'use strict';

/**
 * setup.js — FluxFlow Token Auto-Discovery
 * Jalankan sekali untuk menemukan address token fUSD & WBTC
 * Usage: node setup.js
 */

const { ethers } = require('ethers');
const chalk      = require('chalk');
const fs         = require('fs');
const path       = require('path');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const ABI_PATH    = path.join(__dirname, 'abi', 'contracts.json');

async function main() {
  console.log(chalk.cyan('\n  ┌─────────────────────────────────────────┐'));
  console.log(chalk.cyan('  │  FluxFlow Token Discovery Setup         │'));
  console.log(chalk.cyan('  │  by Noya-xen • github.com/Noya-xen      │'));
  console.log(chalk.cyan('  └─────────────────────────────────────────┘\n'));

  const config  = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const allAbi  = JSON.parse(fs.readFileSync(ABI_PATH, 'utf8'));

  const provider = new ethers.JsonRpcProvider(config.network.rpc);

  // Cek koneksi
  try {
    const net = await provider.getNetwork();
    console.log(chalk.green(`  [✔] Terhubung ke ${config.network.name} (chainId: ${net.chainId})\n`));
  } catch (e) {
    console.log(chalk.red(`  [✘] Gagal konek ke RPC: ${e.message}`));
    process.exit(1);
  }

  // Query PoolCreated events dari factory
  // event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)
  const POOL_CREATED_TOPIC = '0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118';
  const factory = config.contracts.factory;
  
  console.log(chalk.yellow('  [~] Scanning PoolCreated events dari factory...'));
  
  let logs = [];
  try {
    logs = await provider.getLogs({
      address:   factory,
      topics:    [POOL_CREATED_TOPIC],
      fromBlock: 0,
      toBlock:   'latest',
    });
  } catch (e) {
    console.log(chalk.red(`  [✘] Gagal fetch logs: ${e.message}`));
    process.exit(1);
  }

  console.log(chalk.green(`  [✔] Ditemukan ${logs.length} pool\n`));

  // Decode: token0 = topics[1], token1 = topics[2]
  const wethAddr = config.contracts.weth.toLowerCase();
  const discovered = {};
  const poolMap    = {};

  for (const l of logs) {
    const token0 = '0x' + l.topics[1].slice(26);
    const token1 = '0x' + l.topics[2].slice(26);
    const fee    = parseInt(l.topics[3], 16);
    const poolAddr = '0x' + l.data.slice(26 + 64, 26 + 64 + 40); // last 20 bytes

    // Fetch symbol untuk token yang bukan WETH
    for (const addr of [token0, token1]) {
      if (!discovered[addr.toLowerCase()]) {
        try {
          const tok = new ethers.Contract(addr, allAbi.ERC20, provider);
          const sym = await tok.symbol();
          const dec = await tok.decimals();
          discovered[addr.toLowerCase()] = { address: addr, symbol: sym, decimals: Number(dec) };
          console.log(chalk.cyan(`  Token found: ${sym} → ${addr}`));
        } catch (_) {}
      }
    }

    const key = `${discovered[token0.toLowerCase()]?.symbol || token0.slice(0,8)}/${discovered[token1.toLowerCase()]?.symbol || token1.slice(0,8)} ${fee/10000}%`;
    poolMap[key] = { token0, token1, fee, pool: poolAddr };
  }

  console.log(chalk.yellow('\n  [~] Pool list:'));
  for (const [k, v] of Object.entries(poolMap)) {
    console.log(chalk.white(`     ${k} → ${v.pool}`));
  }

  // Update config.json dengan token addresses
  let changed = false;
  for (const [, info] of Object.entries(discovered)) {
    if (info.symbol === 'fUSD' || info.symbol === 'FUSD') {
      config.tokens.fUSD     = info.address;
      config.decimals = config.decimals || {};
      config.decimals.fUSD   = info.decimals;
      changed = true;
      console.log(chalk.green(`\n  [✔] fUSD address: ${info.address} (${info.decimals} decimals)`));
    }
    if (info.symbol === 'WBTC') {
      config.tokens.WBTC     = info.address;
      config.decimals = config.decimals || {};
      config.decimals.WBTC   = info.decimals;
      changed = true;
      console.log(chalk.green(`  [✔] WBTC address: ${info.address} (${info.decimals} decimals)`));
    }
  }

  if (changed) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    console.log(chalk.green('\n  [✔] config.json sudah diupdate otomatis!\n'));
  } else {
    console.log(chalk.yellow('\n  [!] Token fUSD / WBTC tidak ditemukan otomatis.'));
    console.log(chalk.yellow('  [!] Isi manual di config.json → tokens.fUSD dan tokens.WBTC\n'));

    // Tampilkan semua token yang ditemukan untuk referensi
    console.log(chalk.cyan('  Semua token yang ditemukan:'));
    for (const [, v] of Object.entries(discovered)) {
      console.log(chalk.white(`    ${v.symbol.padEnd(10)} → ${v.address}`));
    }
    console.log('');
  }
}

main().catch(e => {
  console.error(chalk.red(`[FATAL] ${e.message}`));
  process.exit(1);
});
