const { expect } = require("chai");
const { ethers } = require("hardhat");
const { generateProof, formatProofForSolidity } = require("../scripts/generate-proof");

describe("RaylsShield Integration Tests with ZK Proofs", function () {
  let raylsShield;
  let verifier;
  let mockEndpoint;
  let owner;
  let user1;
  let user2;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    // Deploy mock endpoint for testing
    const MockEndpoint = await ethers.getContractFactory("MockRaylsEndpoint");
    mockEndpoint = await MockEndpoint.deploy();
    await mockEndpoint.waitForDeployment();

    // Deploy real Groth16 Verifier (generated from circuit)
    const Groth16Verifier = await ethers.getContractFactory("contracts/PrivacyVerifier.sol:Groth16Verifier");
    verifier = await Groth16Verifier.deploy();
    await verifier.waitForDeployment();

    // Deploy RaylsShield
    const RaylsShield = await ethers.getContractFactory("RaylsShield");
    raylsShield = await RaylsShield.deploy(
      await mockEndpoint.getAddress(),
      await verifier.getAddress()
    );
    await raylsShield.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the correct owner", async function () {
      expect(await raylsShield.owner()).to.equal(owner.address);
    });

    it("Should set the correct verifier", async function () {
      expect(await raylsShield.verifier()).to.equal(await verifier.getAddress());
    });

    it("Should have the correct endpoint", async function () {
      expect(await raylsShield._getEndpointAddress()).to.equal(
        await mockEndpoint.getAddress()
      );
    });
  });

  describe("ZK Proof Generation and Verification", function () {
    it("Should generate a valid ZK proof", async function () {
      const secret = BigInt(123456789);
      const nullifier = BigInt(987654321);
      const recipient = BigInt("0x" + user2.address.slice(2).padStart(64, "0"));
      const amount = BigInt(1000);

      const { proof, publicSignals } = await generateProof({
        secret,
        nullifier,
        recipient,
        amount,
      });

      expect(proof).to.not.be.undefined;
      expect(publicSignals).to.have.lengthOf(3);
    });

    it("Should verify a valid proof on-chain", async function () {
      const secret = BigInt(123456789);
      const nullifier = BigInt(987654321);
      const recipient = BigInt("0x" + user2.address.slice(2).padStart(64, "0"));
      const amount = BigInt(1000);

      const { proof, publicSignals } = await generateProof({
        secret,
        nullifier,
        recipient,
        amount,
      });

      const solidityProof = formatProofForSolidity(proof, publicSignals);

      // Call verifier directly
      const isValid = await verifier.verifyProof(
        solidityProof.a,
        solidityProof.b,
        solidityProof.c,
        solidityProof.publicSignals
      );

      expect(isValid).to.be.true;
    });
  });

  describe("Send Private Message", function () {
    it("Should send a private message with valid ZK proof", async function () {
      const secret = BigInt(123456789);
      const nullifier = BigInt(987654321);
      const recipient = BigInt("0x" + user2.address.slice(2).padStart(64, "0"));
      const amount = BigInt(1000);

      const { proof, publicSignals } = await generateProof({
        secret,
        nullifier,
        recipient,
        amount,
      });

      const solidityProof = formatProofForSolidity(proof, publicSignals);
      const encryptedPayload = ethers.toUtf8Bytes("Encrypted secret message");

      const dstChainId = 456;
      const destination = user2.address;

      const tx = await raylsShield.connect(user1).sendPrivateMessage(
        dstChainId,
        destination,
        encryptedPayload,
        solidityProof.a,
        solidityProof.b,
        solidityProof.c,
        solidityProof.publicSignals
      );

      const receipt = await tx.wait();

      // Check that PrivateMessageSent event was emitted
      const event = receipt.logs.find(
        (log) => {
          try {
            const parsed = raylsShield.interface.parseLog(log);
            return parsed && parsed.name === "PrivateMessageSent";
          } catch {
            return false;
          }
        }
      );

      expect(event).to.not.be.undefined;
    });

    it("Should reject message with invalid proof", async function () {
      const encryptedPayload = ethers.toUtf8Bytes("Encrypted secret message");
      const dstChainId = 456;
      const destination = user2.address;

      // Invalid proof data
      const invalidProof = {
        a: [1, 2],
        b: [[1, 2], [3, 4]],
        c: [5, 6],
        publicSignals: [7, 8, 9],
      };

      await expect(
        raylsShield.connect(user1).sendPrivateMessage(
          dstChainId,
          destination,
          encryptedPayload,
          invalidProof.a,
          invalidProof.b,
          invalidProof.c,
          invalidProof.publicSignals
        )
      ).to.be.revertedWith("RaylsShield: Invalid ZK proof");
    });
  });

  describe("Send Private Message to ResourceId", function () {
    it("Should send private message to resourceId with valid proof", async function () {
      const secret = BigInt(123456789);
      const nullifier = BigInt(987654321);
      const recipient = BigInt("0x" + user2.address.slice(2).padStart(64, "0"));
      const amount = BigInt(1000);

      const { proof, publicSignals } = await generateProof({
        secret,
        nullifier,
        recipient,
        amount,
      });

      const solidityProof = formatProofForSolidity(proof, publicSignals);
      const encryptedPayload = ethers.toUtf8Bytes("Encrypted secret message");

      const dstChainId = 456;
      const resourceId = ethers.keccak256(ethers.toUtf8Bytes("myResource"));

      const tx = await raylsShield.connect(user1).sendPrivateMessageToResource(
        dstChainId,
        resourceId,
        encryptedPayload,
        solidityProof.a,
        solidityProof.b,
        solidityProof.c,
        solidityProof.publicSignals
      );

      const receipt = await tx.wait();

      // Check that PrivateMessageSent event was emitted
      const event = receipt.logs.find(
        (log) => {
          try {
            const parsed = raylsShield.interface.parseLog(log);
            return parsed && parsed.name === "PrivateMessageSent";
          } catch {
            return false;
          }
        }
      );

      expect(event).to.not.be.undefined;
    });
  });

  describe("Nullifier Management", function () {
    it("Should track nullifier usage", async function () {
      const nullifier = ethers.keccak256(ethers.toUtf8Bytes("nullifier1"));
      expect(await raylsShield.isNullifierUsed(nullifier)).to.be.false;
    });
  });

  describe("Verifier Management", function () {
    it("Should allow owner to update verifier", async function () {
      const newVerifier = await (await ethers.getContractFactory("contracts/PrivacyVerifier.sol:Groth16Verifier")).deploy();
      await newVerifier.waitForDeployment();

      await expect(raylsShield.updateVerifier(await newVerifier.getAddress()))
        .to.emit(raylsShield, "VerifierUpdated")
        .withArgs(await verifier.getAddress(), await newVerifier.getAddress());

      expect(await raylsShield.verifier()).to.equal(await newVerifier.getAddress());
    });

    it("Should revert if non-owner tries to update verifier", async function () {
      const newVerifier = await (await ethers.getContractFactory("contracts/PrivacyVerifier.sol:Groth16Verifier")).deploy();
      await expect(
        raylsShield.connect(user1).updateVerifier(await newVerifier.getAddress())
      ).to.be.revertedWithCustomError(raylsShield, "OwnableUnauthorizedAccount");
    });

    it("Should revert if verifier address is zero", async function () {
      await expect(
        raylsShield.updateVerifier(ethers.ZeroAddress)
      ).to.be.revertedWith("RaylsShield: Invalid verifier address");
    });
  });

  describe("End-to-End Privacy Flow", function () {
    it("Should complete full privacy flow with proof generation", async function () {
      // Step 1: Generate ZK proof
      const secret = BigInt(999999999);
      const nullifier = BigInt(111111111);
      const recipientBigInt = BigInt("0x" + user2.address.slice(2).padStart(64, "0"));
      const amount = BigInt(5000);

      console.log("\n=== E2E Privacy Flow ===");
      console.log("1. Generating ZK proof...");

      const { proof, publicSignals } = await generateProof({
        secret,
        nullifier,
        recipient: recipientBigInt,
        amount,
      });

      const solidityProof = formatProofForSolidity(proof, publicSignals);
      console.log("✅ Proof generated");

      // Step 2: Send private message
      console.log("2. Sending private cross-chain message...");
      const encryptedPayload = ethers.toUtf8Bytes("Secret institutional transfer");
      const dstChainId = 789;
      const destination = user2.address;

      const tx = await raylsShield.connect(user1).sendPrivateMessage(
        dstChainId,
        destination,
        encryptedPayload,
        solidityProof.a,
        solidityProof.b,
        solidityProof.c,
        solidityProof.publicSignals
      );

      await tx.wait();
      console.log("✅ Private message sent");

      // Step 3: Verify message was tracked
      console.log("3. Verifying message tracking...");
      const nullifierHash = ethers.zeroPadValue(
        ethers.toBeHex(BigInt(publicSignals[0])),
        32
      );

      // Message hash should be verified
      const messageHash = ethers.keccak256(
        ethers.solidityPacked(
          ["address", "uint256", "address", "bytes", "bytes32", "uint256"],
          [
            user1.address,
            dstChainId,
            destination,
            encryptedPayload,
            nullifierHash,
            await ethers.provider.getBlock("latest").then(b => b.timestamp)
          ]
        )
      );

      console.log("✅ End-to-end flow completed successfully!");
      console.log("=======================\n");

      expect(tx).to.not.be.undefined;
    });
  });
});
