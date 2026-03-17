'use strict';

/**
 * ╔════════════════════════════════════════════════════════╗
 * ║       FluxFlow Auto Bot — Swap & Liquidity             ║
 * ║  Fluent Testnet | app.fluxflow.fi                      ║
 * ║  by Noya-xen • https://github.com/Noya-xen             ║
 * ║  link projek : *(isi secara manual di GitHub)*         ║
 * ╚════════════════════════════════════════════════════════╝
 */

const { ethers }  = require('ethers');
const chalk       = require('chalk');
const fs          = require('fs');
const path        = require('path');
const { CronJob } = require('cron');

const { log, sleep, buildProvider, wibNow } = require('./src/utils');
const { runSwapSession }                    = require('./src/swap');
const { addLiquidity }                      = require('./src/liquidity');
const { claimFaucet }                       = require('./src/faucet');

const CONFIG  = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'),       'utf8'));
const ALL_ABI = JSON.parse(fs.readFileSync(path.join(__dirname, 'abi/contracts.json'), 'utf8'));

// ── Validasi token addresses ──────────────────────────────────────────────────
function validateConfig() {
  for (const [k, v] of Object.entries(CONFIG.tokens)) {
    if (v === 'FILL_ME') {
      console.log(chalk.red(`\n  [✘] Token address '${k}' belum diisi di config.json!\n`));
      process.exit(1);
    }
  }
}

// ── printCredit ───────────────────────────────────────────────────────────────
function printCredit() {
  const c = chalk.hex('#7B8CDE');
  const w = chalk.white;
  console.log('\n' + c('  ╔════════════════════════════════════════════════════════╗'));
  console.log(c('  ║') + w('       FluxFlow Auto Bot — Swap & Liquidity             ') + c('║'));
  console.log(c('  ║') + w('       Fluent Testnet | app.fluxflow.fi                 ') + c('║'));
  console.log(c('  ║') + chalk.hex('#a8b4f0')('       by Noya-xen • https://github.com/Noya-xen         ') + c('║'));
  console.log(c('  ╚════════════════════════════════════════════════════════╝\n'));
}

// ── Build contracts ───────────────────────────────────────────────────────────
function buildContracts(provider) {
  const { contracts, tokens } = CONFIG;
  return {
    router:       new ethers.Contract(contracts.swapRouter,         ALL_ABI.SwapRouter,         provider),
    nftManager:   new ethers.Contract(contracts.nftPositionManager, ALL_ABI.NftPositionManager, provider),
    factory:      new ethers.Contract(contracts.factory,            ALL_ABI.Factory,             provider),
    wethContract: new ethers.Contract(tokens.WETH,                  ALL_ABI.WETH,                provider),
    fUSDContract: new ethers.Contract(tokens.fUSD,                  ALL_ABI.ERC20,               provider),
    wbtcContract: new ethers.Contract(tokens.WBTC,                  ALL_ABI.ERC20,               provider),
  };
}

// ── Process satu akun ─────────────────────────────────────────────────────────
async function processAccount(accountData, index, total) {
  const { name, privateKey, proxy } = accountData;
  const { network, tokens, settings } = CONFIG;

  console.log(chalk.hex('#7B8CDE')(
    `\n  ┌─[ Akun ${index + 1}/${total} ]─ ${name || 'Unnamed'} ──────────────────────`));
  console.log(chalk.hex('#7B8CDE')(`  │ Waktu  : ${wibNow()}`));

  const provider = buildProvider(network.rpc, proxy);
  const wallet   = new ethers.Wallet(privateKey, provider);
  console.log(chalk.hex('#7B8CDE')(`  │ Wallet : ${wallet.address}`));
  console.log(chalk.hex('#7B8CDE')('  └─────────────────────────────────────────────────────\n'));

  const c = buildContracts(provider);

  // ── Cek saldo ETH ──
  let ethBal;
  try {
    ethBal = await provider.getBalance(wallet.address);
    log.info(`Saldo ETH  : ${ethers.formatEther(ethBal)} ETH`);
  } catch (e) {
    log.error(`Gagal cek saldo: ${e.message}`); return;
  }

  if (ethBal < ethers.parseEther('0.001')) {
    log.warn('Saldo ETH rendah — mencoba claim faucet...');
    await claimFaucet(wallet.address, CONFIG);
    await sleep(6000);
    ethBal = await provider.getBalance(wallet.address);
    log.info(`Saldo setelah faucet: ${ethers.formatEther(ethBal)} ETH`);
  }

  // ── Cek saldo token ──
  try {
    const fUSDdec = await c.fUSDContract.decimals();
    const wbtcDec = await c.wbtcContract.decimals();
    const fUSDBal = await c.fUSDContract.balanceOf(wallet.address);
    const wbtcBal = await c.wbtcContract.balanceOf(wallet.address);
    log.info(`Saldo fUSD : ${ethers.formatUnits(fUSDBal, fUSDdec)} fUSD`);
    log.info(`Saldo WBTC : ${ethers.formatUnits(wbtcBal, wbtcDec)} WBTC`);
  } catch (_) {}

  // ════════════════ SWAP SESSION ════════════════
  console.log(chalk.yellow(`\n  ═══ [SWAP] ${settings.swapCount}x — Mode: ${settings.swapMode || 'both'} ═══`));
  let swapOk = 0;
  try {
    swapOk = await runSwapSession(wallet, {
      router:       c.router,
      wethContract: c.wethContract,
      fUSDContract: c.fUSDContract,
      wbtcContract: c.wbtcContract,
    }, {
      swapAmountETH:  settings.swapAmountETH,
      swapAmountFUSD: settings.swapAmountFUSD,
      swapAmountWBTC: settings.swapAmountWBTC,
      swapCount:      settings.swapCount,
      fee:            settings.defaultFee,
      gasLimit:       settings.gasLimit,
      delayMs:        settings.delayBetweenSwapsMs,
      explorer:       network.explorer,
      mode:           settings.swapMode || 'both',
    });
    log.success(`Swap selesai: ${swapOk}/${settings.swapCount} sukses`);
  } catch (e) {
    log.error(`Swap session error: ${e.message?.slice(0, 100)}`);
  }

  await sleep(5000);

  // ════════════════ ADD LP ETH/fUSD ════════════════
  console.log(chalk.yellow('\n  ═══ [LP] Add Liquidity ETH/fUSD ═══'));
  try {
    const fUSDdec = Number(await c.fUSDContract.decimals());
    const fUSDBal = await c.fUSDContract.balanceOf(wallet.address);
    const fUSDbal_f = parseFloat(ethers.formatUnits(fUSDBal, fUSDdec));

    if (fUSDbal_f < parseFloat(settings.liquidityAmountFUSD)) {
      log.warn(`fUSD tidak cukup (${fUSDbal_f.toFixed(4)} < ${settings.liquidityAmountFUSD}) — skip LP ETH/fUSD`);
    } else {
      await addLiquidity(wallet, {
        nftManager:     c.nftManager,
        factory:        c.factory,
        wethContract:   c.wethContract,
        tokenAContract: c.wethContract,
        tokenBContract: c.fUSDContract,
        poolAbi:        ALL_ABI.Pool,
        provider,
      }, {
        amountA:             settings.liquidityAmountETH,
        amountB:             settings.liquidityAmountFUSD,
        fee:                 settings.defaultFee,
        tickRangeMultiplier: 10,
        gasLimit:            settings.gasLimit,
        explorer:            network.explorer,
      });
    }
  } catch (e) {
    log.error(`LP ETH/fUSD error: ${e.message?.slice(0, 120)}`);
  }

  await sleep(4000);

  // ════════════════ ADD LP WBTC/ETH ════════════════
  console.log(chalk.yellow('\n  ═══ [LP] Add Liquidity WBTC/ETH ═══'));
  try {
    const wbtcDec = Number(await c.wbtcContract.decimals());
    const wbtcBal = await c.wbtcContract.balanceOf(wallet.address);
    const wbtcBal_f = parseFloat(ethers.formatUnits(wbtcBal, wbtcDec));

    if (wbtcBal_f < parseFloat(settings.swapAmountWBTC)) {
      log.warn(`WBTC tidak cukup (${wbtcBal_f.toFixed(8)}) — skip LP WBTC/ETH`);
    } else {
      await addLiquidity(wallet, {
        nftManager:     c.nftManager,
        factory:        c.factory,
        wethContract:   c.wethContract,
        tokenAContract: c.wbtcContract,
        tokenBContract: c.wethContract,
        poolAbi:        ALL_ABI.Pool,
        provider,
      }, {
        amountA:             settings.swapAmountWBTC,
        amountB:             settings.liquidityAmountETH,
        fee:                 3000,
        tickRangeMultiplier: 10,
        gasLimit:            settings.gasLimit,
        explorer:            network.explorer,
      });
    }
  } catch (e) {
    log.error(`LP WBTC/ETH error: ${e.message?.slice(0, 120)}`);
  }

  log.success(`[${name || wallet.address.slice(0,8)}] Sesi selesai ✓\n`);
}

// ── Run semua akun ────────────────────────────────────────────────────────────
async function runAllAccounts() {
  const accountsPath = path.join(__dirname, 'accounts.json');
  if (!fs.existsSync(accountsPath)) {
    console.log(chalk.red('  [✘] accounts.json tidak ditemukan!'));
    console.log(chalk.yellow('  Salin dari template: cp accounts_template.json accounts.json\n'));
    process.exit(1);
  }

  const accounts = JSON.parse(fs.readFileSync(accountsPath, 'utf8'));
  log.info(`Total akun: ${accounts.length}`);

  for (let i = 0; i < accounts.length; i++) {
    await processAccount(accounts[i], i, accounts.length);
    if (i < accounts.length - 1) {
      const delay = CONFIG.settings.delayBetweenAccountMs + Math.floor(Math.random() * 10000);
      log.info(`Jeda antar akun: ${(delay/1000).toFixed(1)}s...`);
      await sleep(delay);
    }
  }

  console.log(chalk.green(`\n  ✓ Semua akun selesai [${wibNow()}]\n`));
}

// ── Entry point ───────────────────────────────────────────────────────────────
async function main() {
  printCredit();
  validateConfig();

  if (CONFIG.settings.runOnSchedule) {
    const [h, m] = CONFIG.settings.scheduleTime.split(':').map(Number);
    const utcH   = ((h - 7) + 24) % 24;
    const cron   = `${m} ${utcH} * * *`;
    console.log(chalk.cyan(`  [⏰] Scheduled: setiap hari jam ${CONFIG.settings.scheduleTime} WIB (cron: ${cron})\n`));
    await runAllAccounts(); 
    const job = new CronJob(cron, () => runAllAccounts(), null, true, 'UTC');
    job.start();
    console.log(chalk.green('  [✓] Bot menunggu jadwal berikutnya...\n'));
  } else if (CONFIG.settings.isLooping) {
    while (true) {
      await runAllAccounts();
      const waitMs = CONFIG.settings.loopWaitHours * 60 * 60 * 1000;
      log.info(`Siklus selesai. Menunggu ${CONFIG.settings.loopWaitHours} jam untuk berjalan kembali...`);
      await sleep(waitMs);
    }
  } else {
    await runAllAccounts();
  }
}

main().catch(e => {
  console.error(chalk.red(`\n  [FATAL] ${e.message}`));
  process.exit(1);
});
