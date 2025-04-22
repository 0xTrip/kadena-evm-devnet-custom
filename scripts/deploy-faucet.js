// scripts/deploy-faucet.js
const fs = require('fs');
const path = require('path');
const { chainweb, ethers, network } = require('hardhat');

async function main() {
    console.log(`Deploying ThrottledFaucet`);
    const PRIVATE_KEY = process.env.FAUCET_PRIVATE_KEY || '0xdf57089febbacf7ba0bc227dafbffa9fc08a93fdc68e1e42411a14efcf23656e';
    let provider;
    let faucetWallet;

    // Define constructor arguments
    const cooldownPeriod = process.env.COOLDOWN_PERIOD; 
    const nativeTokenAmount = ethers.parseEther(process.env.NATIVE_TOKEN_AMOUNT); 

    // Create directories if they don't exist
    const deploymentDir = path.join(__dirname, '../contracts/deployments');
    fs.mkdirSync(deploymentDir, { recursive: true });
    console.log(`Deployment directory: ${deploymentDir}`);

    // Get the chain IDs for fund calculation
    const chainIds = await chainweb.getChainIds();
    const chainCount = chainIds.length;
    console.log(`Deploying to ${chainCount} chains: ${chainIds.join(', ')}`);


    // Deploy to each chain using runOverChains
    const deployments = await chainweb.runOverChains(async (chainId) => {
        console.log(`\n==== Deploying to chain ${chainId} ====`);

        try {
            // Get the provider for the current chain and the faucet wallet attached to it
            provider = ethers.provider;
            faucetWallet = new ethers.Wallet(PRIVATE_KEY, provider);

            console.log(`Network ${network.name}`);

            // Check if the wallet is connected
            if (!faucetWallet) {
                console.error('Failed to connect to the wallet');
                return;
            }
            console.log(`Faucet wallet address: ${faucetWallet.address}`);

            const faucetWalletBalance = await provider.getBalance(faucetWallet.address);
            console.log(`Faucet wallet balance: ${ethers.formatEther(faucetWalletBalance)} KDA`);

            // Get the signer address to use as the owner
            const [deployer] = await ethers.getSigners();
            console.log(`Faucet deployer address: ${deployer.address}`);

            // Get the contract factory
            const ThrottledFaucet = await ethers.getContractFactory("ThrottledFaucet");

            // Deploy the contract
            console.log(`Deploying contract on chain ${chainId}...`);
            const faucetContract = await ThrottledFaucet.deploy(
                cooldownPeriod,
                nativeTokenAmount
            );


            // Wait for the transaction to be mined
            const deployReceipt = await faucetContract.deploymentTransaction().wait();
            console.log(`Faucet deployment transaction confirmed: ${deployReceipt.hash}`);

            const contractAddress = await faucetContract.getAddress();
            console.log(`Faucet contract deployed at address ${contractAddress} on chain ${chainId} with network name  ${network.name}`);

            // Grant roles ad fund smart contract with native tokens
            try {
                // Grant roles
                const ADMIN_ROLE = await faucetContract.ADMIN_ROLE();
                console.log(`Granting ADMIN_ROLE (${ADMIN_ROLE}) to ${deployer.address}`);
                const grantTx1 = await faucetContract.grantRole(ADMIN_ROLE, deployer.address);
                await grantTx1.wait();
                console.log(`Successfully granted ADMIN_ROLE to deployer`);

                const FAUCET_ROLE = await faucetContract.FAUCET_ROLE();
                console.log(`Granting FAUCET_ROLE (${FAUCET_ROLE}) to ${faucetWallet.address}`);
                const grantTx2 = await faucetContract.grantRole(FAUCET_ROLE, faucetWallet.address);
                await grantTx2.wait();
                console.log(`Successfully granted FAUCET_ROLE to faucet wallet`);


                // Calculate amount to send (half of the proportional balance per chain)
                const fundAmount = faucetWalletBalance / BigInt(chainCount * 2);
                const nativeTokenAmountWei = await faucetContract.nativeTokenAmount();

                if (fundAmount < nativeTokenAmountWei) {
                    throw new Error(`Fund amount (${ethers.formatEther(fundAmount)} KDA) is less than required dispense amount (${ethers.formatEther(nativeTokenAmountWei)} KDA)`);
                }

                console.log(`Funding contract on chain ${chainId} with ${ethers.formatEther(fundAmount)} KDA`);

                // Check faucet contract balance before funding
                const balanceBeforeFunding = await provider.getBalance(contractAddress);

                const fundTx = await faucetWallet.sendTransaction({
                    to: contractAddress,
                    value: fundAmount
                });

                // Wait for transaction with confirmations
                const receipt = await fundTx.wait(1); // wait for 1 confirmation

                // Check contract balance after funding
                const balanceAfterFunding = await provider.getBalance(contractAddress);
                const balanceChange = balanceAfterFunding - balanceBeforeFunding;

                console.log('Funding verification:', {
                    txHash: fundTx.hash,
                    status: receipt.status === 1 ? 'success' : 'failed',
                    balanceBefore: ethers.formatEther(balanceBeforeFunding),
                    balanceAfter: ethers.formatEther(balanceAfterFunding),
                    change: ethers.formatEther(balanceChange),
                    expectedAmount: ethers.formatEther(fundAmount)
                });

                if (balanceChange !== fundAmount) {
                    console.warn('WARNING: Balance change does not match fund amount!', {
                        actual: ethers.formatEther(balanceChange),
                        expected: ethers.formatEther(fundAmount)
                    });
                }


                // Verify the configuration
                console.log('Contract configuration:', {
                    chainId,
                    faucetContractBalance: ethers.formatEther(balanceAfterFunding),
                    dispenseAmount: ethers.formatEther(nativeTokenAmountWei),
                    cooldownPeriod,
                    hasFaucetRole: await faucetContract.hasRole(FAUCET_ROLE, faucetWallet.address),
                    hasAdminRole: await faucetContract.hasRole(ADMIN_ROLE, deployer.address)
                });
            } catch (error) {
                console.error(`Error funding contract on chain ${chainId}: ${error.message}`);
            }

            // Create deployment JSON
            const deploymentData = {
                chain: chainId,
                address: contractAddress,
                deployer: deployer.address,
                params: {
                    cooldownPeriod,
                    nativeTokenAmount: nativeTokenAmount.toString()
                },
                deployedAt: new Date().toISOString()
            };

            // Create directory for this chain
            const networkDir = path.join(deploymentDir, network.name);
            fs.mkdirSync(networkDir, { recursive: true });

            // Write to file
            const filePath = path.join(networkDir, `ThrottledFaucet.json`);
            fs.writeFileSync(
                filePath,
                JSON.stringify(deploymentData, null, 2)
            );
            console.log(`Faucet deployment data saved to ${filePath}`);
            console.log(`==== Finished deploying to chain ${chainId} ====\n`);

            // Return the deployment info for this chain
            return {
                chainId,
                address: contractAddress,
                contract: faucetContract
            };

        } catch (error) {
            console.error(`Error deploying to chain ${chainId}:`, error);
            return null;
        }
    });

    // Filter out any failed deployments
    const successfulDeployments = deployments.filter(d => d !== null);
    console.log(`Faucet successfully deployed to ${successfulDeployments.length} chains`);
    console.log("Faucet deployment process completed");
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error("Faucet deployment failed:", error);
        process.exit(1);
    });