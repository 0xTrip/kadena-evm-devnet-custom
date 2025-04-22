# Kadena EVM Faucet Contract

This is the faucet smart contract. It dispenses native token to a receipient address. A faucet wallet pays for the gas (handled in the dApp). The reciient does not pay for the gas. The ThrottledFaucet contract keeps track of each user's request time and reverts if a user tries to request tokens before the cooldown period has elapsed.

The Throttled faucet contract can be deployed using the `scripts/deploy-faucet.js` script. To deploy it to the internal chainweb chains, run
```
npx hardhat run scripts/deploy-faucet.js

```
To deploy it to external chainweb nodes equivalent to hardhat localhost, first run
```
npx haradhat node

```
in a terminal.  In a separate terminal, run

```
npx hardhat run scripts/deploy-faucet.js --chainweb localhost

```

## To Do
Finish unit tests
Configure devnet (later testnet and mainnet) as chainweb networks in hardhat.config.js
Test deploying to devnet (later testnet and mainnet) using `--chainweb <<network name>>`

## Standard Hardhat Commands
```shell
npx hardhat help
npx hardhat test
npx hardhat node
```
