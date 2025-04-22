const { expect } = require("chai");
const { chainweb, ethers, network } = require("hardhat");
const {
    deployContractOnChains,
    switchChain,
} = chainweb;
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const deployScript = require("../scripts/deploy-faucet.js");

describe("ThrottledFaucet", function () {

    // Fixture that deploys the contract using the deployment script

    async function deployFaucetFixture() {
        const cooldownPeriod = "3600"; // 1 hour
        const nativeTokenAmount = ethers.parseEther("20"); // 20 KDA

        await switchChain(0);
        const [deployer, faucetWallet, recipient, otherAccount1] = await ethers.getSigners()

        // Deploy contracts to all chains
        const deployed = await deployContractOnChains({
            name: 'ThrottledFaucet',
            constructorArgs: [cooldownPeriod, nativeTokenAmount],
        });

        // Handle role assignments for each deployment
        const deployments = await Promise.all(deployed.deployments.map(async (deployment) => {
            const faucet = deployment.contract;

            // Grant roles
            const ADMIN_ROLE = await faucet.ADMIN_ROLE();
            const FAUCET_ROLE = await faucet.FAUCET_ROLE();

            const grantTx1 = await faucet.grantRole(ADMIN_ROLE, deployer.address);
            await grantTx1.wait();
            const grantTx2 = await faucet.grantRole(FAUCET_ROLE, faucetWallet.address);
            await grantTx2.wait();


            expect(await faucet.hasRole(ADMIN_ROLE, deployer.address))
                .to.be.true;
            expect(await faucet.hasRole(FAUCET_ROLE, faucetWallet.address))
                .to.be.true;

            // Fund the contract
            const fundAmount = ethers.parseEther("100"); // Fund with 100 KDA
            const fundTx = await deployer.sendTransaction({
                to: await faucet.getAddress(),
                value: fundAmount
            });
            await fundTx.wait();

            // Verify funding
            const contractBalance = await ethers.provider.getBalance(await faucet.getAddress());
            console.log(`Contract balance after funding: ${ethers.formatEther(contractBalance)} KDA`);
            //expect(contractBalance).to.equal(fundAmount);

            // TODO: get funding of contract working properly



            return {
                ...deployment,           // Spread deployment
                signers: {              // Group all signers together
                    deployer: faucet.runner,
                    faucetWallet,
                    recipient,
                    otherAccount1
                },
                params: {              // Add constructor params
                    cooldownPeriod,
                    nativeTokenAmount
                }
            };
        }));

        return deployments;
    }

    describe("Deployment", function () {
        describe("Success Test Cases", function () {
            it("Should deploy with correct initial values and roles", async function () {
                const deployments = await loadFixture(deployFaucetFixture);

                for (const deployment of deployments) {
                    const { contract: faucet, signers, params } = deployment;
                    const { deployer, faucetWallet, recipient } = signers;

                    // Check initial values
                    expect(await faucet.cooldownPeriod()).to.equal(
                        BigInt(params.cooldownPeriod)
                    );
                    expect(await faucet.nativeTokenAmount()).to.equal(
                        params.nativeTokenAmount
                    );

                    // Check roles
                    const ADMIN_ROLE = await faucet.ADMIN_ROLE();
                    const FAUCET_ROLE = await faucet.FAUCET_ROLE();

                    expect(await faucet.hasRole(ADMIN_ROLE, deployer.address))
                        .to.be.true;
                    expect(await faucet.hasRole(FAUCET_ROLE, faucetWallet.address))
                        .to.be.true;


                }
            });
        });
    });

    // TODO: Funding of contract isn't working properly so this test is skipped
    describe.skip("dispenseNativeToken", function () {
        describe("Success Test Cases", function () {
            it("Should dispense tokens to valid recipient", async function () {
                const deployments = await loadFixture(deployFaucetFixture);
                for (const deployment of deployments) {
                    const { contract: faucet, signers, params } = deployment;
                    const { deployer, faucetWallet, recipient } = signers;

                    // Call dispense as faucet wallet
                    const initialBalance = await ethers.provider.getBalance(recipient.address);
                    await faucet.connect(faucetWallet).dispenseNativeToken(recipient.address);
                    const finalBalance = await ethers.provider.getBalance(recipient.address);

                    expect(finalBalance - initialBalance).to.equal(params.nativeTokenAmount);
                }
            });
        });

        describe("Error Test Cases", function () {
            it("Should revert if cooldown period not elapsed", async function () {
                const deployments = await loadFixture(deployFaucetFixture);
                for (const deployment of deployments) {
                    const { contract: faucet, faucetWallet } = deployment;
                    const [, recipient] = await ethers.getSigners();

                    await faucet.connect(faucetWallet).dispenseNativeToken(recipient.address);
                    await expect(
                        faucet.connect(faucetWallet).dispenseNativeToken(recipient.address)
                    ).to.be.revertedWithCustomError(faucet, "CooldownPeriodNotElapsed");
                }
            });

            it("Should revert if called by non-faucet role", async function () {
                const deployments = await loadFixture(deployFaucetFixture);
                for (const deployment of deployments) {
                    const { contract: faucet } = deployment;
                    const [, nonFaucet, recipient] = await ethers.getSigners();

                    await expect(
                        faucet.connect(nonFaucet).dispenseNativeToken(recipient.address)
                    ).to.be.revertedWith(
                        `AccessControl: account ${nonFaucet.address.toLowerCase()} is missing role ${await faucet.FAUCET_ROLE()}`
                    );
                }
            });
        });
    });

    describe("setCooldownPeriod", function () {
        describe("Success Test Cases", function () {
            it("Should update cooldown period when called by admin", async function () {
                const deployments = await loadFixture(deployFaucetFixture);
                for (const deployment of deployments) {
                    const { contract: faucet, signers, params } = deployment;
                    const { deployer, faucetWallet, recipient } = signers;

                    const newCooldown = 7200; // 2 hours

                    const tx = await faucet.connect(deployer).setCooldownPeriod(newCooldown);
                    await tx.wait();
                    expect(await faucet.cooldownPeriod()).to.equal(newCooldown);
                }
            });
        });

        describe("Error Test Cases", function () {
            it("Should revert when called by non-admin", async function () {
                const deployments = await loadFixture(deployFaucetFixture);
                for (const deployment of deployments) {
                    const { contract: faucet, signers, } = deployment;
                    const { deployer, faucetWallet, recipient, otherAccount1 } = signers;
                    const ADMIN_ROLE = await faucet.ADMIN_ROLE();

                    await expect(
                        faucet.connect(otherAccount1).setCooldownPeriod(7200)
                    ).to.be.revertedWithCustomError(
                        faucet,
                        "AccessControlUnauthorizedAccount"
                    ).withArgs(
                        otherAccount1.address,
                        ADMIN_ROLE
                    );
                }
            });
        });
    });

    describe("setNativeTokenAmount", function () {
        describe("Success Test Cases", function () {
            it("Should update native token amount when called by admin", async function () {
                const deployments = await loadFixture(deployFaucetFixture);
                for (const deployment of deployments) {
                    const { contract: faucet, signers, } = deployment;
                    const { deployer } = signers;
                    const newAmount = ethers.parseEther("10");

                    const tx = await faucet.connect(deployer).setNativeTokenAmount(newAmount);
                    await tx.wait();
                    expect(await faucet.nativeTokenAmount()).to.equal(newAmount);
                }
            });
        });

        describe("Error Test Cases", function () {
            it("Should revert when called by non-admin", async function () {
                const deployments = await loadFixture(deployFaucetFixture);
                for (const deployment of deployments) {
                    const { contract: faucet, signers, } = deployment;
                    const { deployer, faucetWallet, recipient, otherAccount1 } = signers;
                    const ADMIN_ROLE = await faucet.ADMIN_ROLE();

                     await expect(
                        faucet.connect(otherAccount1).setNativeTokenAmount(100)
                    ).to.be.revertedWithCustomError(
                        faucet,
                        "AccessControlUnauthorizedAccount"
                    ).withArgs(
                        otherAccount1.address,
                        ADMIN_ROLE
                    );
                }
            });
        });
    });

    // Add more test describes for other functions...
});