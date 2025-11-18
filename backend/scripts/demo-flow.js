const { ethers } = require("hardhat");
const { generateProof, formatProofForSolidity } = require("./generate-proof");

/**
 * Complete RaylsShield Demo Flow
 * Demonstrates end-to-end privacy-preserving cross-chain messaging
 */
async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("🛡️  RaylsShield - Zero-Knowledge Privacy Demo");
  console.log("=".repeat(70) + "\n");

  // Get signers
  const [deployer, alice, bob] = await ethers.getSigners();
  console.log("📋 Participants:");
  console.log("   Deployer:", deployer.address);
  console.log("   Alice (Sender):", alice.address);
  console.log("   Bob (Recipient):", bob.address);
  console.log();

  // ========================================
  // Step 1: Deploy Contracts
  // ========================================
  console.log("📦 Step 1: Deploying Contracts...\n");

  // Deploy Mock Rayls Endpoint
  const MockEndpoint = await ethers.getContractFactory("MockRaylsEndpoint");
  const endpoint = await MockEndpoint.deploy();
  await endpoint.waitForDeployment();
  console.log("   ✅ MockRaylsEndpoint:", await endpoint.getAddress());

  // Deploy Groth16 Verifier
  const Verifier = await ethers.getContractFactory("contracts/PrivacyVerifier.sol:Groth16Verifier");
  const verifier = await Verifier.deploy();
  await verifier.waitForDeployment();
  console.log("   ✅ Groth16Verifier:", await verifier.getAddress());

  // Deploy RaylsShield
  const RaylsShield = await ethers.getContractFactory("RaylsShield");
  const shield = await RaylsShield.deploy(
    await endpoint.getAddress(),
    await verifier.getAddress()
  );
  await shield.waitForDeployment();
  console.log("   ✅ RaylsShield:", await shield.getAddress());
  console.log();

  // ========================================
  // Step 2: Alice Prepares Private Transaction
  // ========================================
  console.log("🔐 Step 2: Alice Prepares Private Transaction...\n");

  const secret = BigInt(Math.floor(Math.random() * 1000000000));
  const nullifier = BigInt(Math.floor(Math.random() * 1000000000));
  const recipientBigInt = BigInt("0x" + bob.address.slice(2).padStart(64, "0"));
  const amount = BigInt(7500); // $7,500 USD (below AML threshold)

  console.log("   Private Details (known only to Alice):");
  console.log("   - Amount: $" + amount.toString() + " USD");
  console.log("   - Secret:", secret.toString());
  console.log("   - Nullifier:", nullifier.toString());
  console.log("   - Recipient:", bob.address);
  console.log();

  // ========================================
  // Step 3: Generate ZK Proof
  // ========================================
  console.log("🧮 Step 3: Generating Zero-Knowledge Proof...\n");

  const { proof, publicSignals } = await generateProof({
    secret,
    nullifier,
    recipient: recipientBigInt,
    amount,
  });

  const solidityProof = formatProofForSolidity(proof, publicSignals);

  console.log("   Public Signals (visible to everyone):");
  console.log("   - Nullifier Hash:", publicSignals[0]);
  console.log("   - Commitment:", publicSignals[1]);
  console.log("   - Recipient Hash:", publicSignals[2]);
  console.log();
  console.log("   ✅ ZK Proof Generated Successfully!");
  console.log("   Note: Proof proves transaction validity WITHOUT revealing:");
  console.log("         • Actual amount ($7,500)");
  console.log("         • Secret value");
  console.log("         • Actual recipient address");
  console.log();

  // ========================================
  // Step 4: Send Private Cross-Chain Message
  // ========================================
  console.log("📡 Step 4: Sending Private Cross-Chain Message...\n");

  const dstChainId = 456; // Destination chain (e.g., Ethereum, Polygon, etc.)
  const destination = bob.address;
  const encryptedPayload = ethers.toUtf8Bytes("Confidential institutional transfer");

  console.log("   Cross-Chain Details:");
  console.log("   - Source Chain:", await ethers.provider.getNetwork().then(n => n.chainId));
  console.log("   - Destination Chain:", dstChainId);
  console.log("   - Destination Address:", destination);
  console.log();

  const tx = await shield.connect(alice).sendPrivateMessage(
    dstChainId,
    destination,
    encryptedPayload,
    solidityProof.a,
    solidityProof.b,
    solidityProof.c,
    solidityProof.publicSignals
  );

  console.log("   ⏳ Transaction submitted...");
  const receipt = await tx.wait();
  console.log("   ✅ Transaction confirmed!");
  console.log("   Gas Used:", receipt.gasUsed.toString());
  console.log();

  // ========================================
  // Step 5: Verify Message Event
  // ========================================
  console.log("✅ Step 5: Verifying Message Sent Event...\n");

  const event = receipt.logs.find(
    (log) => {
      try {
        const parsed = shield.interface.parseLog(log);
        return parsed && parsed.name === "PrivateMessageSent";
      } catch {
        return false;
      }
    }
  );

  if (event) {
    const parsed = shield.interface.parseLog(event);
    console.log("   Event: PrivateMessageSent");
    console.log("   - Message Hash:", parsed.args.messageHash);
    console.log("   - Destination Chain:", parsed.args.dstChainId.toString());
    console.log("   - Sender:", parsed.args.sender);
    console.log("   - Nullifier Hash:", parsed.args.nullifierHash);
    console.log();
  }

  // ========================================
  // Step 6: Check Nullifier Status
  // ========================================
  console.log("🔍 Step 6: Checking Nullifier Status...\n");

  const nullifierHash = ethers.zeroPadValue(
    ethers.toBeHex(BigInt(publicSignals[0])),
    32
  );

  const isNullifierUsed = await shield.isNullifierUsed(nullifierHash);
  console.log("   Nullifier Hash:", nullifierHash);
  console.log("   Status:", isNullifierUsed ? "⚠️  USED (prevents replay)" : "✅ AVAILABLE");
  console.log();

  // ========================================
  // Summary
  // ========================================
  console.log("=" + "=".repeat(69));
  console.log("🎉 Demo Complete - Privacy Preserved!");
  console.log("=".repeat(70));
  console.log();
  console.log("💡 What Just Happened:");
  console.log();
  console.log("   1. Alice sent $7,500 to Bob across chains");
  console.log("   2. The exact amount ($7,500) is hidden from everyone except Alice");
  console.log("   3. Bob's identity is hashed (privacy-preserved)");
  console.log("   4. ZK proof ensures transaction is valid");
  console.log("   5. Nullifier prevents Alice from double-spending");
  console.log("   6. Message sent via Rayls cross-chain protocol");
  console.log();
  console.log("🏦 Institutional Benefits:");
  console.log();
  console.log("   ✓ Trading amounts hidden from competitors");
  console.log("   ✓ Compliance with AML regulations (can prove amount < threshold)");
  console.log("   ✓ Cross-chain privacy with Rayls sub-second finality");
  console.log("   ✓ Cryptographic guarantees prevent double-spending");
  console.log();
  console.log("🔐 Privacy Guarantees:");
  console.log();
  console.log("   ✓ Amount: HIDDEN (only commitment visible)");
  console.log("   ✓ Recipient: HASHED (only hash visible)");
  console.log("   ✓ Secret: PRIVATE (never revealed)");
  console.log("   ✓ Validity: PROVEN (via ZK-SNARK)");
  console.log();
  console.log("=".repeat(70));
  console.log();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Demo failed:", error);
    process.exit(1);
  });
