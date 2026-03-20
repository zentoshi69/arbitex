# ArbitEx Smart Contracts

## Prerequisites

Install [Foundry](https://book.getfoundry.sh/getting-started/installation):

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

## Setup

```bash
cd contracts

# Install OpenZeppelin + forge-std
forge install OpenZeppelin/openzeppelin-contracts --no-commit
forge install foundry-rs/forge-std --no-commit

# Build
forge build
```

## Deploy FlashArb to Avalanche C-Chain

```bash
# Set your deployer private key (the wallet that will OWN the contract)
export DEPLOYER_PRIVATE_KEY="0x..."
export AVALANCHE_RPC_URL="https://api.avax.network/ext/bc/C/rpc"

# Dry run (simulation)
forge script script/DeployFlashArb.s.sol:DeployFlashArb \
  --rpc-url $AVALANCHE_RPC_URL \
  --chain-id 43114 \
  -vvv

# Deploy for real (add --broadcast)
forge script script/DeployFlashArb.s.sol:DeployFlashArb \
  --rpc-url $AVALANCHE_RPC_URL \
  --chain-id 43114 \
  --broadcast \
  -vvv

# Verify on Snowtrace (optional)
export SNOWTRACE_API_KEY="your-key"
forge script script/DeployFlashArb.s.sol:DeployFlashArb \
  --rpc-url $AVALANCHE_RPC_URL \
  --chain-id 43114 \
  --broadcast \
  --verify \
  -vvv
```

After deployment, copy the printed contract address into `.env.prod`:

```
FLASH_ARB_ADDRESS=0x...
```

Then rebuild the worker container to pick it up.

## Testing

```bash
forge test -vvv
```
