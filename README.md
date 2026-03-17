# 🔷 FluxFlow Auto Bot — Swap & Liquidity

> Testnet bot untuk [app.fluxflow.fi](https://app.fluxflow.fi/points?ref=TVSJ) di Fluent Testnet 
> Auto-swap ETH↔fUSD + Add Concentrated Liquidity V3 untuk farming points  
> by **Noya-xen** • [github.com/Noya-xen](https://github.com/Noya-xen)

link projek: https://app.fluxflow.fi/points?ref=TVSJ

---

## 📋 Fitur

- ✅ **Auto Swap** — Bolak-balik ETH ↔ fUSD (configurable berapa kali)
- ✅ **Add Liquidity** — Tambah concentrated V3 LP ETH/fUSD dengan tight range (max point multiplier)
- ✅ **Auto Faucet** — Coba claim faucet jika saldo ETH rendah
- ✅ **Multi Akun** — Jalankan banyak wallet sekaligus dari `accounts.json`
- ✅ **Proxy Support** — Rotasi proxy per akun
- ✅ **Token Auto-Discovery** — `setup.js` otomatis temukan address fUSD & WBTC dari factory
- ✅ **Scheduled Mode** — Cron job otomatis di waktu tertentu (WIB)
- ✅ **Output Terminal** — Log berwarna + timestamp WIB

---

## 🗂️ Struktur Project

```
FluxFlow-Auto-Bot/
├── main.js                    ← Entry point utama
├── setup.js                   ← Token discovery (jalankan sekali)
├── config.json                ← Konfigurasi network, contract, settings
├── accounts.json              ← Data akun (di .gitignore, buat dari template)
├── accounts_template.json     ← Template akun
├── package.json
├── abi/
│   └── contracts.json         ← ABI SwapRouter, NftPositionManager, ERC20, dll
└── src/
    ├── utils.js               ← Helper functions
    ├── swap.js                ← Swap logic
    ├── liquidity.js           ← Add liquidity V3
    └── faucet.js              ← Faucet claim
```

---

## ⚙️ Setup & Instalasi

### 1. Install dependencies
```bash
npm install
```

### 2. Setup akun
```bash
cp accounts_template.json accounts.json
```
Edit `accounts.json` dengan private key kamu:
```json
[
  {
    "name": "Akun 1",
    "privateKey": "0x_PRIVATE_KEY_KAMU",
    "proxy": null
  }
]
```

### 3. Temukan token addresses (fUSD & WBTC)
```bash
node setup.js
```
Script ini akan otomatis scan factory events dan update `config.json`.  
Jika gagal, isi manual di `config.json` → bagian `tokens.fUSD` dan `tokens.WBTC`.

### 4. Jalankan bot
```bash
node main.js
```

---

## 🛠️ Konfigurasi (`config.json`)

| Key | Default | Keterangan |
|-----|---------|------------|
| `swapAmountETH` | `"0.002"` | Jumlah ETH per swap |
| `swapAmountFUSD` | `"5"` | Jumlah fUSD per swap balik |
| `swapCount` | `5` | Berapa kali swap per sesi |
| `liquidityAmountETH` | `"0.005"` | ETH yang di-deposit ke LP |
| `liquidityAmountFUSD` | `"15"` | fUSD yang di-deposit ke LP |
| `defaultFee` | `3000` | Fee tier pool (500/3000/10000) |
| `delayBetweenSwapsMs` | `8000` | Jeda antar swap (ms) |
| `delayBetweenAccountMs` | `15000` | Jeda antar akun (ms) |
| `runOnSchedule` | `false` | Mode terjadwal |
| `scheduleTime` | `"07:30"` | Jam eksekusi WIB |

---

## 💡 Tips Maximize Points

Per dokumentasi FluxFlow:
- **Swap lebih sering** → lebih besar share swap points
- **Tight LP range** → bonus multiplier untuk V3 concentrated liquidity
- **Tahan LP lama** → time-weighted, makin lama makin banyak points
- **Top 100 weekly** → dapat 1.5x High Council multiplier

---

## 🔗 Contract Addresses (Fluent Testnet)

| Contract | Address |
|----------|---------|
| SwapRouter | `0x69Be606be7Fd2d27C8f9821329c748c77d24FF4f` |
| NFT Position Manager | `0x8a82fC5f9EFF14B3e5A31dcCB04873a97AE4be92` |
| Factory (V3) | `0xC64f4F7FB80AbE310E6cB178c58a01296cE85Abb` |
| Quoter | `0x2853645B3362Cc7460AEaaB2b30BBd12a2F8e099` |
| WETH | `0x3d38e57b5d23c3881affb8bc0978d5e0bd96c1c6` |

---

## ⚠️ Disclaimer

Script ini untuk keperluan testnet saja. Jangan gunakan private key mainnet.  
Gunakan akun terpisah khusus untuk testnet.

---

> Made with 💜 by [Noya-xen](https://github.com/Noya-xen) | [@xinomixo](https://x.com/xinomixo)
