const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RaylsShield", function () {
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

    // Deploy Groth16Verifier
    const Groth16Verifier = await ethers.getContractFactory("Groth16Verifier");
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

  describe("Verifier Management", function () {
    it("Should allow owner to update verifier", async function () {
      const newVerifier = await (await ethers.getContractFactory("Groth16Verifier")).deploy();
      await newVerifier.waitForDeployment();

      await expect(raylsShield.updateVerifier(await newVerifier.getAddress()))
        .to.emit(raylsShield, "VerifierUpdated")
        .withArgs(await verifier.getAddress(), await newVerifier.getAddress());

      expect(await raylsShield.verifier()).to.equal(await newVerifier.getAddress());
    });

    it("Should revert if non-owner tries to update verifier", async function () {
      const newVerifier = await (await ethers.getContractFactory("Groth16Verifier")).deploy();
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

  describe("Message Verification", function () {
    it("Should track verified messages", async function () {
      const messageHash = ethers.keccak256(ethers.toUtf8Bytes("test message"));
      expect(await raylsShield.isMessageVerified(messageHash)).to.equal(false);
    });

    it("Should track nullifiers", async function () {
      const nullifier = ethers.keccak256(ethers.toUtf8Bytes("nullifier"));
      expect(await raylsShield.isNullifierUsed(nullifier)).to.equal(false);
    });
  });

  // Note: Full integration tests would require:
  // 1. Compiled Circom circuits with actual proofs
  // 2. Mock or actual Rayls endpoint setup
  // 3. Valid ZK proof generation

  describe("Integration Tests (Placeholder)", function () {
    it("Should be ready for ZK proof integration", async function () {
      // This is where you would test with actual ZK proofs
      // after compiling the Circom circuits
      expect(await verifier.getAddress()).to.not.equal(ethers.ZeroAddress);
    });
  });
});

// Mock Rayls Endpoint for testing
// This would be replaced with actual Rayls endpoint in production
const MockRaylsEndpointSource = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockRaylsEndpoint {
    mapping(bytes32 => address) public resourceIds;
    address[] public trustedExecutors;

    function send(uint256, address, bytes calldata) external payable returns (bytes32) {
        return keccak256(abi.encodePacked(block.timestamp, msg.sender));
    }

    function sendToResourceId(uint256, bytes32, bytes calldata) external payable returns (bytes32) {
        return keccak256(abi.encodePacked(block.timestamp, msg.sender));
    }

    function registerResourceId(bytes32 _resourceId, address _address) external {
        resourceIds[_resourceId] = _address;
    }

    function getAddressByResourceId(bytes32 _resourceId) external view returns (address) {
        return resourceIds[_resourceId];
    }

    function isTrustedExecutor(address _executor) external view returns (bool) {
        for (uint i = 0; i < trustedExecutors.length; i++) {
            if (trustedExecutors[i] == _executor) return true;
        }
        return false;
    }

    function getCommitChainId() external pure returns (uint256) {
        return 1;
    }
}
`;
