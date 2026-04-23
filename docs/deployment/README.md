# StellarRoute Deployment Runbook

This guide covers everything needed to deploy, verify, upgrade, and monitor StellarRoute contracts on Stellar Testnet and Mainnet.

## Prerequisites

- Rust 1.75+ with `wasm32-unknown-unknown` target
- Soroban CLI (`cargo install --locked soroban-cli`)
- `jq` (for JSON parsing in scripts)
- A funded Stellar account (use Friendbot for testnet)

## Key Management

### Local Development
```bash
# Generate a new identity (stored in ~/.config/soroban/identity/)
soroban keys generate deployer --network testnet

# Fund on testnet via Friendbot
curl "https://friendbot.stellar.org/?addr=$(soroban keys address deployer)"
```

### CI/CD (GitHub Actions)
- Store the deployer secret key as a GitHub repository secret: `SOROBAN_DEPLOYER_SECRET`
- Store the deployed contract ID as a repository variable: `SOROBAN_CONTRACT_ID`
- Set `DEPLOY_ENABLED=true` as a repository variable to enable the deploy workflow.

### Security Rules
- **NEVER** commit private keys, seed phrases, or secret keys to the repository.
- **NEVER** share identity files across environments (testnet vs mainnet).
- Use separate deployer accounts for testnet and mainnet.
- Rotate keys if compromise is suspected.
- The `.gitignore` excludes `.soroban/`, `*.secret-key`, and `identity.toml`.

## Testnet Deployment (From Clean Machine)

### 1. Setup
```bash
# Clone and enter the repository
git clone https://github.com/StellarRoute/StellarRoute.git
cd StellarRoute

# Install Rust + WASM target
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32-unknown-unknown

# Install Soroban CLI
cargo install --locked soroban-cli

# Generate and fund deployer identity
soroban keys generate deployer --network testnet
curl "https://friendbot.stellar.org/?addr=$(soroban keys address deployer)"
```

### 2. Deploy
```bash
./scripts/deploy.sh --network testnet
```

This will:
1. Build contracts to WASM
2. Optimize the WASM binary
3. Deploy router + adapter contracts to testnet
4. Initialize router with deployer as admin, 30 bps fee rate
5. Save contract IDs to `config/deployment-testnet.json`
6. Verify router deployment by calling `get_admin()`

Environment and runtime options:
```bash
# optional defaults
export STELLAR_NETWORK=testnet

# simulate without writing on-chain transactions
./scripts/deploy.sh --dry-run

# use a non-default soroban identity name
./scripts/deploy.sh --network testnet --identity deployer
```

### 3. Register Pools
Edit `config/pools-testnet.json` with real pool addresses, then:
```bash
./scripts/register-pools.sh --network testnet
```

### 4. Verify
```bash
./scripts/verify.sh --network testnet
```

### 5. Monitor
```bash
./scripts/monitor.sh --network testnet
```

## Upgrade Process

### When to Upgrade
- Bug fixes in contract logic
- New features (e.g., additional getter functions)
- Performance improvements

### How to Upgrade
```bash
# Increment CONTRACT_VERSION in crates/contracts/src/router.rs
# Then run:
./scripts/upgrade.sh --network testnet
```

The upgrade script will:
1. Capture pre-upgrade state (admin, fee rate, paused status, pool count, version)
2. Build and optimize new WASM
3. Compare bytecode hashes (skip if identical)
4. Install new WASM on-chain
5. Propose a timelocked router upgrade using `propose_upgrade`
6. Redeploy adapter contract with the new WASM
7. Verify all critical invariants are preserved
8. Update the deployment artifact

### Post-Upgrade Verification
```bash
./scripts/verify.sh --network testnet
./scripts/monitor.sh --network testnet
```

### Rollback Limitations
Soroban does **not** support native rollback. Once a contract is upgraded:
- The old WASM code is replaced.
- Storage state is preserved (keys and values persist).
- To "rollback," you must deploy the previous WASM version as a new upgrade.

**Recommendation**: Always keep the last known-good WASM binary archived (the deploy workflow uploads it as a GitHub Actions artifact with 30-day retention).

## Data Migration Strategy

If a contract upgrade changes the storage schema (e.g., new `StorageKey` variants):

1. **Additive changes** (new keys): No migration needed. New keys will have default values (`unwrap_or` pattern).
2. **Renamed keys**: Requires a migration function that reads old keys and writes new ones. This must be called once after upgrade.
3. **Removed keys**: Old keys will remain in storage but become unused. They will naturally expire when their TTL runs out.
4. **Changed value types**: Not supported without migration. Deploy a one-time migration entrypoint, call it, then upgrade again to remove the migration code.

## Communication Checklist for Upgrades

Before deploying an upgrade to mainnet:

- [ ] All changes reviewed and merged to `main`
- [ ] Testnet deployment successful and verified
- [ ] Changelog written describing what changed and why
- [ ] Stakeholders notified (Discord, GitHub Discussions)
- [ ] Monitoring in place for post-upgrade health checks
- [ ] Previous WASM binary archived
- [ ] Deployment artifact backed up

## CI/CD Workflows

### Manual Deploy (`deploy-testnet.yml`)
- Trigger: GitHub Actions > "Deploy to Testnet" > Run workflow
- Supports dry-run mode (build + hash only, no deploy)
- Requires `SOROBAN_DEPLOYER_SECRET` secret and `DEPLOY_ENABLED=true` variable

### Nightly Verification (`verify-contracts.yml`)
- Runs automatically at 03:00 UTC daily
- Rebuilds contracts from source and compares bytecode hash against deployed contract
- Requires `SOROBAN_CONTRACT_ID` repository variable
- Fails the workflow if hashes mismatch

## Troubleshooting

### "No deployment artifact found"
Run `./scripts/deploy.sh --network testnet` first. The deployment artifact is generated at deploy time.

### "Soroban CLI not found"
```bash
cargo install --locked soroban-cli
# Ensure ~/.cargo/bin is in your PATH
```

### "Identity not found"
```bash
soroban keys generate deployer --network testnet
# Or import an existing key:
echo "S..." | soroban keys add deployer --secret-key stdin
```

### "Transaction failed: insufficient balance"
Fund the deployer account:
```bash
# Testnet
curl "https://friendbot.stellar.org/?addr=$(soroban keys address deployer)"
# Mainnet: transfer XLM from an exchange or wallet
```
