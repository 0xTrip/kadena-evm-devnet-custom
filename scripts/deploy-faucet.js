// scripts/deploy-faucet.js
const fs = require("fs");
const path = require("path");
const { chainweb, ethers, network } = require("hardhat");

async function main() {
  console.log(`Network name: ${network.name}`); // Now properly after imports
  console.log(`Deploying ThrottledFaucet`);
  const PRIVATE_KEY =
    process.env.FAUCET_PRIVATE_KEY ||
    "0xdf57089febbacf7ba0bc227dafbffa9fc08a93fdc68e1e42411a14efcf23656e";
  let provider;
  let faucetWallet;

  // Define constructor arguments with defaults
  const cooldownPeriod = process.env.COOLDOWN_PERIOD || "86400";
  const nativeTokenAmount = ethers.parseEther(
    process.env.NATIVE_TOKEN_AMOUNT || "20"
  );

  console.log(
    `Using parameters: cooldownPeriod=${cooldownPeriod}, nativeTokenAmount=${ethers.formatEther(
      nativeTokenAmount
    )} ETH`
  );

  // Create directories if they don't exist
  const deploymentDir = path.join(__dirname, "../contracts/deployments");
  fs.mkdirSync(deploymentDir, { recursive: true });
  console.log(`Deployment directory: ${deploymentDir}`);

  // NEW: Check if we're in stress test mode
  const stressTestMode = process.env.STRESS_TEST === "true";
  const stressTestCount = parseInt(process.env.STRESS_TEST_COUNT || "1");
  const stressTestChain = process.env.STRESS_TEST_CHAIN;

  // Get the chain IDs for deployment
  let chainIds = await chainweb.getChainIds();

  // If in stress test mode, only use the specified chain
  if (stressTestMode && stressTestChain) {
    chainIds = [stressTestChain];
    console.log(
      `STRESS TEST MODE: Will deploy ${stressTestCount} contracts to chain ${stressTestChain}`
    );
  }

  const chainCount = chainIds.length;
  console.log(`Deploying to ${chainCount} chains: ${chainIds.join(", ")}`);

  // Display wallet balance before any deployments
  provider = ethers.provider;
  faucetWallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const initialWalletBalance = await provider.getBalance(faucetWallet.address);
  console.log(
    `Initial wallet balance: ${ethers.formatEther(
      initialWalletBalance
    )} KDA/ETH`
  );

  // Loop through each chain
  for (const chainId of chainIds) {
    console.log(`\n==== Processing chain ${chainId} ====`);

    // For stress testing, we'll deploy multiple times to the same chain
    const deploymentCount = stressTestMode ? stressTestCount : 1;

    // Create an array to store all gas data for stress testing
    const stressTestGasData = [];

    for (let i = 0; i < deploymentCount; i++) {
      if (stressTestMode) {
        console.log(
          `\n-- Stress test deployment ${i + 1}/${stressTestCount} --`
        );
      }

      try {
        // Get the provider for the current chain and the faucet wallet attached to it
        provider = ethers.provider;
        faucetWallet = new ethers.Wallet(PRIVATE_KEY, provider);

        console.log(`Network ${network.name}`);

        // Check if the wallet is connected
        if (!faucetWallet) {
          console.error("Failed to connect to the wallet");
          continue;
        }

        console.log(`Faucet wallet address: ${faucetWallet.address}`);

        const faucetWalletBalance = await provider.getBalance(
          faucetWallet.address
        );
        console.log(
          `Faucet wallet balance: ${ethers.formatEther(
            faucetWalletBalance
          )} KDA/ETH`
        );

        // Get the signer address to use as the owner
        const [deployer] = await ethers.getSigners();
        console.log(`Faucet deployer address: ${deployer.address}`);

        // Log deployer balance
        const deployerBalance = await provider.getBalance(deployer.address);
        console.log(
          `Deployer balance: ${ethers.formatEther(deployerBalance)} KDA/ETH`
        );

        // Get the contract factory
        const ThrottledFaucet = await ethers.getContractFactory(
          "ThrottledFaucet"
        );

        // Deploy the contract
        console.log(`Deploying contract on chain ${chainId}...`);
        const faucetContract = await ThrottledFaucet.deploy(
          cooldownPeriod,
          nativeTokenAmount
        );

        // Wait for the transaction to be mined
        const deployReceipt = await faucetContract
          .deploymentTransaction()
          .wait();
        console.log(
          `Faucet deployment transaction confirmed: ${deployReceipt.hash}`
        );

        const contractAddress = await faucetContract.getAddress();
        console.log(
          `Faucet contract deployed at address ${contractAddress} on chain ${chainId} with network name ${network.name}`
        );

        // Grant roles but don't fund smart contract with native tokens
        try {
          // Grant roles
          const ADMIN_ROLE = await faucetContract.ADMIN_ROLE();
          console.log(
            `Granting ADMIN_ROLE (${ADMIN_ROLE}) to ${deployer.address}`
          );
          const grantTx1 = await faucetContract.grantRole(
            ADMIN_ROLE,
            deployer.address
          );
          await grantTx1.wait();
          console.log(`Successfully granted ADMIN_ROLE to deployer`);

          const FAUCET_ROLE = await faucetContract.FAUCET_ROLE();
          console.log(
            `Granting FAUCET_ROLE (${FAUCET_ROLE}) to ${faucetWallet.address}`
          );
          const grantTx2 = await faucetContract.grantRole(
            FAUCET_ROLE,
            faucetWallet.address
          );
          await grantTx2.wait();
          console.log(`Successfully granted FAUCET_ROLE to faucet wallet`);

          /* 
          // COMMENTED OUT: Funding section to avoid spending ETH
          const fundAmount = faucetWalletBalance / BigInt(chainCount * 2);
          const nativeTokenAmountWei = await faucetContract.nativeTokenAmount();

          if (fundAmount < nativeTokenAmountWei) {
            throw new Error(
              `Fund amount (${ethers.formatEther(
                fundAmount
              )} KDA) is less than required dispense amount (${ethers.formatEther(
                nativeTokenAmountWei
              )} KDA)`
            );
          }

          console.log(
            `Funding contract on chain ${chainId} with ${ethers.formatEther(
              fundAmount
            )} KDA`
          );

          // Check faucet contract balance before funding
          const balanceBeforeFunding = await provider.getBalance(contractAddress);

          const fundTx = await faucetWallet.sendTransaction({
            to: contractAddress,
            value: fundAmount,
          });

          // Wait for transaction with confirmations
          const receipt = await fundTx.wait(1); // wait for 1 confirmation

          // Check contract balance after funding
          const balanceAfterFunding = await provider.getBalance(contractAddress);
          const balanceChange = balanceAfterFunding - balanceBeforeFunding;

          console.log("Funding verification:", {
            txHash: fundTx.hash,
            status: receipt.status === 1 ? "success" : "failed",
            balanceBefore: ethers.formatEther(balanceBeforeFunding),
            balanceAfter: ethers.formatEther(balanceAfterFunding),
            change: ethers.formatEther(balanceChange),
            expectedAmount: ethers.formatEther(fundAmount),
          });

          if (balanceChange !== fundAmount) {
            console.warn("WARNING: Balance change does not match fund amount!", {
              actual: ethers.formatEther(balanceChange),
              expected: ethers.formatEther(fundAmount),
            });
          }
          */

          // Check contract balance (will be 0 as we're not funding it)
          const contractBalance = await provider.getBalance(contractAddress);

          // Verify the configuration
          console.log("Contract configuration:", {
            chainId,
            faucetContractBalance: ethers.formatEther(contractBalance),
            dispenseAmount: ethers.formatEther(
              await faucetContract.nativeTokenAmount()
            ),
            cooldownPeriod,
            hasFaucetRole: await faucetContract.hasRole(
              FAUCET_ROLE,
              faucetWallet.address
            ),
            hasAdminRole: await faucetContract.hasRole(
              ADMIN_ROLE,
              deployer.address
            ),
          });
        } catch (error) {
          console.error(
            `Error setting up roles for contract on chain ${chainId}: ${error.message}`
          );
        }

        // Get gas information from the deployment receipt
        const gasUsed = deployReceipt.gasUsed;
        const gasPrice =
          deployReceipt.gasPrice || deployReceipt.effectiveGasPrice;
        const gasCost = gasUsed * gasPrice;

        // Current timestamp for deployment
        const deploymentTimestamp = new Date().toISOString();

        // Get just the gas data for stress testing summary
        const gasData = {
          gasUsed: gasUsed.toString(),
          gasPrice: gasPrice.toString(),
          gasCost: gasCost.toString(),
          gasCostInEther: ethers.formatEther(gasCost),
          deployedAt: deploymentTimestamp,
          contractAddress: contractAddress,
          txHash: deployReceipt.hash,
        };

        // Add to stress test array
        if (stressTestMode) {
          stressTestGasData.push(gasData);
        }

        // Create deployment JSON - NOTE: updated with gas information
        const deploymentData = {
          chain: chainId,
          address: contractAddress,
          deployer: deployer.address,
          params: {
            cooldownPeriod,
            nativeTokenAmount: nativeTokenAmount.toString(),
          },
          gas: {
            gasUsed: gasUsed.toString(),
            gasPrice: gasPrice.toString(),
            gasCost: gasCost.toString(),
            gasCostInEther: ethers.formatEther(gasCost),
          },
          deployedAt: deploymentTimestamp,
        };

        // Create directory for this chain
        const networkDir = path.join(deploymentDir, network.name);
        fs.mkdirSync(networkDir, { recursive: true });

        if (!stressTestMode) {
          // For normal deployments, create a unique filename with timestamp for each deployment
          const timestamp = deploymentTimestamp.replace(/[:.]/g, "-");
          const filePath = path.join(
            networkDir,
            `ThrottledFaucet_${timestamp}.json`
          );

          fs.writeFileSync(filePath, JSON.stringify(deploymentData, null, 2));
          console.log(`Faucet deployment data saved to ${filePath}`);
        } else {
          // For stress tests, we'll write a consolidated file at the end
          console.log(`Gas data collected for deployment ${i + 1}`);
        }

        // Check wallet balance after each deployment
        const currentWalletBalance = await provider.getBalance(
          faucetWallet.address
        );
        console.log(
          `Current wallet balance: ${ethers.formatEther(
            currentWalletBalance
          )} KDA/ETH`
        );
        const balanceUsed = initialWalletBalance - currentWalletBalance;
        console.log(
          `Total spent so far: ${ethers.formatEther(balanceUsed)} KDA/ETH`
        );
      } catch (error) {
        console.error(
          `Error deploying to chain ${chainId} (iteration ${i + 1}):`,
          error
        );
      }
    }

    // If this was a stress test, save all gas data to a single file
    if (stressTestMode && stressTestGasData.length > 0) {
      const networkDir = path.join(deploymentDir, network.name);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const summaryFilePath = path.join(
        networkDir,
        `StressTest_Summary_Chain${chainId}_${timestamp}.json`
      );

      // Create a summary object with metadata
      const stressTestSummary = {
        chain: chainId,
        network: network.name,
        totalDeployments: stressTestGasData.length,
        deployments: stressTestGasData,
        timestamps: {
          startedAt: stressTestGasData[0].deployedAt,
          completedAt:
            stressTestGasData[stressTestGasData.length - 1].deployedAt,
        },
      };

      fs.writeFileSync(
        summaryFilePath,
        JSON.stringify(stressTestSummary, null, 2)
      );
      console.log(`Stress test summary saved to ${summaryFilePath}`);
    }

    console.log(`==== Finished processing chain ${chainId} ====\n`);
  }

  // Final wallet balance check
  const finalWalletBalance = await provider.getBalance(faucetWallet.address);
  const totalSpent = initialWalletBalance - finalWalletBalance;
  console.log(`\nDeployment summary:`);
  console.log(
    `Initial balance: ${ethers.formatEther(initialWalletBalance)} KDA/ETH`
  );
  console.log(
    `Final balance: ${ethers.formatEther(finalWalletBalance)} KDA/ETH`
  );
  console.log(`Total spent: ${ethers.formatEther(totalSpent)} KDA/ETH`);

  console.log("Faucet deployment process completed");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Faucet deployment failed:", error);
    process.exit(1);
  });
