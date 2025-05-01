// scripts/test-env-url.js
const axios = require("axios");
require("dotenv").config();

async function main() {
  const rpcUrl = process.env.RPC_URL;
  console.log(`Testing RPC URL from .env file: ${rpcUrl}`);

  try {
    // First try a simple GET request
    console.log("\nTrying GET request...");
    const getResponse = await axios
      .get(rpcUrl, {
        httpsAgent: new (require("https").Agent)({ rejectUnauthorized: false }),
        timeout: 15000,
      })
      .catch((err) => {
        console.log(`GET request failed: ${err.message}`);
        return null;
      });

    if (getResponse) {
      console.log(`GET request succeeded with status ${getResponse.status}`);
    }

    // Then try a proper JSON-RPC request
    console.log("\nTrying JSON-RPC request...");
    const response = await axios.post(
      rpcUrl,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "eth_chainId",
        params: [],
      },
      {
        headers: { "Content-Type": "application/json" },
        httpsAgent: new (require("https").Agent)({ rejectUnauthorized: false }),
        timeout: 15000,
      }
    );

    console.log(`✅ SUCCESS - Status: ${response.status}`);
    console.log(`JSON-RPC Response: ${JSON.stringify(response.data, null, 2)}`);

    console.log("\nSuggested hardhat.config.js network entry:");
    console.log(`
networks: {
  hardhat: {},
  devnet: {
    url: "${rpcUrl}",
    chainId: ${parseInt(response.data.result, 16)}, // ${response.data.result}
    accounts: devnetAccounts.accounts.map((account) => account.privateKey),
    timeout: 60000
  }
}`);
  } catch (error) {
    console.log(`❌ FAILED - ${error.message}`);
    if (error.response) {
      console.log(`  Status: ${error.response.status}`);
      if (error.response.data) {
        const dataStr =
          typeof error.response.data === "object"
            ? JSON.stringify(error.response.data).substring(0, 200)
            : String(error.response.data).substring(0, 200);
        console.log(`  Response: ${dataStr}`);
      }
    }

    console.log("\nPossible issues:");
    console.log(
      "1. The Kadena devnet may be offline or temporarily unavailable"
    );
    console.log("2. There might be network restrictions (VPN, firewall, etc.)");
    console.log(
      "3. The URL format may have changed - check Kadena's latest documentation"
    );
    console.log(
      "4. Your local environment might need additional configuration"
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });
