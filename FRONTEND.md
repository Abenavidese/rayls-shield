# RaylsShield Frontend Integration Guide

## Overview

This guide explains how to integrate RaylsShield's privacy features into a frontend application. RaylsShield provides Zero-Knowledge privacy for cross-chain transactions on Rayls Protocol.

## Architecture

```
Frontend App
    ↓
ZK Proof Generation (Browser)
    ↓
RaylsShield Contract (Blockchain)
    ↓
Cross-Chain Privacy Layer
```

## Prerequisites

### Required Libraries

```bash
npm install ethers@^6.0.0
npm install snarkjs@^0.7.0
npm install circomlibjs@^0.1.7
```

### Browser Compatibility

- Modern browsers with WebAssembly support
- MetaMask or similar Web3 wallet
- ~50MB storage for circuit artifacts

## Setup

### 1. Contract ABIs

Create `src/contracts/abis.js`:

```javascript
export const RAYLS_SHIELD_ABI = [
  "function sendPrivateMessage(uint256 _dstChainId, address _destination, bytes calldata _encryptedPayload, uint256[2] calldata _pA, uint256[2][2] calldata _pB, uint256[2] calldata _pC, uint256[3] calldata _publicSignals) external payable",
  "function isNullifierUsed(bytes32 nullifierHash) external view returns (bool)",
  "event PrivateMessageSent(bytes32 indexed nullifierHash, bytes32 indexed commitment, uint256 dstChainId, address destination)",
  "event PrivateMessageReceived(bytes32 indexed nullifierHash, address indexed receiver, uint256 fromChainId)"
];

export const GROTH16_VERIFIER_ABI = [
  "function verifyProof(uint256[2] calldata _pA, uint256[2][2] calldata _pB, uint256[2] calldata _pC, uint256[3] calldata _pubSignals) external view returns (bool)"
];
```

### 2. Contract Addresses

Create `src/contracts/addresses.js`:

```javascript
export const CONTRACTS = {
  // Rayls Testnet (Chain ID: 123123)
  raylsDevnet: {
    chainId: 123123,
    rpcUrl: "https://devnet-rpc.rayls.com",
    explorerUrl: "https://devnet-explorer.rayls.com",
    contracts: {
      verifier: "0xaF7B67b88128820Fae205A07aDC055ed509Bdb12",
      raylsShield: "0x71E3a04c9Ecc624656334756f70dAAA1fc4F985D"
    }
  }
};
```

### 3. Load Circuit Artifacts

You'll need to serve these files from your `public/` directory:

```
public/
├── circuits/
│   ├── privacy.wasm          # Witness calculator
│   ├── privacy.zkey          # Proving key
│   └── verification_key.json # Verification key
```

Copy from your compiled circuits:

```bash
# From your RaylsShield project root
cp circuits/privacy.wasm public/circuits/
cp circuits/privacy.zkey public/circuits/
cp circuits/verification_key.json public/circuits/
```

## Core Implementation

### 1. ZK Proof Generator

Create `src/utils/zkProof.js`:

```javascript
import { buildPoseidon } from "circomlibjs";

const snarkjs = require("snarkjs");

export class ZKProofGenerator {
  constructor() {
    this.poseidon = null;
    this.wasmPath = "/circuits/privacy.wasm";
    this.zkeyPath = "/circuits/privacy.zkey";
  }

  async initialize() {
    this.poseidon = await buildPoseidon();
  }

  /**
   * Generate a private transaction proof
   * @param {Object} params - Transaction parameters
   * @param {BigInt} params.secret - Private secret
   * @param {BigInt} params.nullifier - Unique nullifier
   * @param {BigInt} params.recipient - Recipient address as BigInt
   * @param {BigInt} params.amount - Transaction amount
   * @returns {Object} Proof and public signals
   */
  async generateProof({ secret, nullifier, recipient, amount }) {
    if (!this.poseidon) await this.initialize();

    const F = this.poseidon.F;

    // Compute public inputs
    const commitment = this.poseidon([secret, nullifier, amount]);
    const nullifierHash = this.poseidon([nullifier]);
    const recipientHash = this.poseidon([recipient]);

    // Prepare circuit inputs
    const inputs = {
      nullifierHash: F.toObject(nullifierHash).toString(),
      commitment: F.toObject(commitment).toString(),
      recipientHash: F.toObject(recipientHash).toString(),
      secret: secret.toString(),
      nullifier: nullifier.toString(),
      recipient: recipient.toString(),
      amount: amount.toString()
    };

    // Generate proof
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      inputs,
      this.wasmPath,
      this.zkeyPath
    );

    return {
      proof,
      publicSignals,
      nullifierHash: F.toObject(nullifierHash).toString()
    };
  }

  /**
   * Format proof for Solidity contract
   */
  formatProofForSolidity(proof, publicSignals) {
    return {
      a: [proof.pi_a[0], proof.pi_a[1]],
      b: [
        [proof.pi_b[0][1], proof.pi_b[0][0]],
        [proof.pi_b[1][1], proof.pi_b[1][0]]
      ],
      c: [proof.pi_c[0], proof.pi_c[1]],
      publicSignals: publicSignals.slice(0, 3)
    };
  }

  /**
   * Verify proof locally before sending to chain
   */
  async verifyProof(proof, publicSignals) {
    const vKey = await fetch("/circuits/verification_key.json").then(r => r.json());
    return await snarkjs.groth16.verify(vKey, publicSignals, proof);
  }
}
```

### 2. RaylsShield Contract Wrapper

Create `src/contracts/RaylsShield.js`:

```javascript
import { ethers } from "ethers";
import { RAYLS_SHIELD_ABI } from "./abis";
import { CONTRACTS } from "./addresses";
import { ZKProofGenerator } from "../utils/zkProof";

export class RaylsShieldClient {
  constructor(signer) {
    this.signer = signer;
    this.network = CONTRACTS.raylsDevnet;
    this.contract = new ethers.Contract(
      this.network.contracts.raylsShield,
      RAYLS_SHIELD_ABI,
      signer
    );
    this.zkGenerator = new ZKProofGenerator();
  }

  async initialize() {
    await this.zkGenerator.initialize();
  }

  /**
   * Send a private cross-chain message
   * @param {Object} params
   * @param {number} params.destinationChainId - Target chain ID
   * @param {string} params.destinationAddress - Recipient address
   * @param {string} params.encryptedPayload - Encrypted message data
   * @param {BigInt} params.secret - Private secret
   * @param {BigInt} params.nullifier - Unique nullifier
   * @param {BigInt} params.amount - Transaction amount
   */
  async sendPrivateMessage({
    destinationChainId,
    destinationAddress,
    encryptedPayload,
    secret,
    nullifier,
    amount
  }) {
    // Convert recipient address to BigInt
    const recipientBigInt = BigInt(destinationAddress);

    // Generate ZK proof
    console.log("Generating ZK proof...");
    const { proof, publicSignals } = await this.zkGenerator.generateProof({
      secret,
      nullifier,
      recipient: recipientBigInt,
      amount
    });

    // Verify proof locally first
    const isValid = await this.zkGenerator.verifyProof(proof, publicSignals);
    if (!isValid) {
      throw new Error("Invalid ZK proof generated");
    }

    // Format for Solidity
    const solidityProof = this.zkGenerator.formatProofForSolidity(proof, publicSignals);

    // Encode encrypted payload
    const encodedPayload = ethers.hexlify(ethers.toUtf8Bytes(encryptedPayload));

    // Send transaction
    console.log("Sending private message to chain...");
    const tx = await this.contract.sendPrivateMessage(
      destinationChainId,
      destinationAddress,
      encodedPayload,
      solidityProof.a,
      solidityProof.b,
      solidityProof.c,
      solidityProof.publicSignals,
      { gasLimit: 500000 }
    );

    console.log("Transaction sent:", tx.hash);
    const receipt = await tx.wait();
    console.log("Transaction confirmed:", receipt.hash);

    return {
      transactionHash: receipt.hash,
      nullifierHash: publicSignals[0],
      commitment: publicSignals[1]
    };
  }

  /**
   * Check if a nullifier has been used (prevents double-spending)
   */
  async isNullifierUsed(nullifierHash) {
    return await this.contract.isNullifierUsed(nullifierHash);
  }

  /**
   * Listen for private message events
   */
  onPrivateMessageSent(callback) {
    this.contract.on("PrivateMessageSent", (nullifierHash, commitment, dstChainId, destination, event) => {
      callback({
        nullifierHash,
        commitment,
        destinationChainId: dstChainId,
        destinationAddress: destination,
        transactionHash: event.transactionHash
      });
    });
  }
}
```

### 3. React Component Example

Create `src/components/PrivateTransfer.jsx`:

```jsx
import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import { RaylsShieldClient } from "../contracts/RaylsShield";

export function PrivateTransfer() {
  const [client, setClient] = useState(null);
  const [status, setStatus] = useState("");
  const [form, setForm] = useState({
    destinationChainId: "789",
    destinationAddress: "",
    encryptedPayload: "",
    amount: "1000"
  });

  useEffect(() => {
    initializeClient();
  }, []);

  async function initializeClient() {
    try {
      // Connect to MetaMask
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();

      // Initialize RaylsShield client
      const shieldClient = new RaylsShieldClient(signer);
      await shieldClient.initialize();
      setClient(shieldClient);
      setStatus("✅ Connected to RaylsShield");
    } catch (error) {
      setStatus(`❌ Error: ${error.message}`);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!client) return;

    try {
      setStatus("🔐 Generating ZK proof...");

      // Generate random secret and nullifier (in production, store securely!)
      const secret = BigInt(Math.floor(Math.random() * 1e15));
      const nullifier = BigInt(Math.floor(Math.random() * 1e15));
      const amount = BigInt(form.amount);

      // Send private message
      const result = await client.sendPrivateMessage({
        destinationChainId: parseInt(form.destinationChainId),
        destinationAddress: form.destinationAddress,
        encryptedPayload: form.encryptedPayload,
        secret,
        nullifier,
        amount
      });

      setStatus(`✅ Private message sent!\nTx: ${result.transactionHash}`);

      // IMPORTANT: Store secret and nullifier securely for recipient to claim!
      console.log("Store these securely:", { secret, nullifier });
    } catch (error) {
      setStatus(`❌ Error: ${error.message}`);
    }
  }

  return (
    <div className="private-transfer">
      <h2>🛡️ RaylsShield Private Transfer</h2>

      <div className="status">{status}</div>

      <form onSubmit={handleSubmit}>
        <div>
          <label>Destination Chain ID:</label>
          <input
            type="number"
            value={form.destinationChainId}
            onChange={e => setForm({ ...form, destinationChainId: e.target.value })}
          />
        </div>

        <div>
          <label>Recipient Address:</label>
          <input
            type="text"
            placeholder="0x..."
            value={form.destinationAddress}
            onChange={e => setForm({ ...form, destinationAddress: e.target.value })}
          />
        </div>

        <div>
          <label>Amount:</label>
          <input
            type="number"
            value={form.amount}
            onChange={e => setForm({ ...form, amount: e.target.value })}
          />
        </div>

        <div>
          <label>Encrypted Message:</label>
          <textarea
            value={form.encryptedPayload}
            onChange={e => setForm({ ...form, encryptedPayload: e.target.value })}
            placeholder="Encrypted payload..."
          />
        </div>

        <button type="submit" disabled={!client}>
          Send Private Transaction
        </button>
      </form>
    </div>
  );
}
```

## Security Best Practices

### 1. Secret Management

**NEVER** expose secrets in client-side code. Use a secure key derivation approach:

```javascript
import { ethers } from "ethers";

// Derive secret from user's signature
async function deriveSecret(signer, nonce) {
  const message = `RaylsShield Secret Derivation - Nonce: ${nonce}`;
  const signature = await signer.signMessage(message);
  const hash = ethers.keccak256(signature);
  return BigInt(hash) % BigInt(2n ** 252n); // BN128 field size
}
```

### 2. Nullifier Generation

Generate unique nullifiers to prevent replay attacks:

```javascript
async function generateNullifier(signer, transactionIndex) {
  const message = `RaylsShield Nullifier - Index: ${transactionIndex}`;
  const signature = await signer.signMessage(message);
  const hash = ethers.keccak256(signature);
  return BigInt(hash) % BigInt(2n ** 252n);
}
```

### 3. Encryption

Encrypt payloads before sending:

```javascript
import { encrypt, decrypt } from "@metamask/eth-sig-util";

async function encryptPayload(recipientPublicKey, data) {
  const encryptedData = encrypt({
    publicKey: recipientPublicKey,
    data: JSON.stringify(data),
    version: "x25519-xsalsa20-poly1305"
  });
  return JSON.stringify(encryptedData);
}
```

## Testing Frontend

### 1. Local Development

```bash
# Start local Hardhat node
npx hardhat node

# Deploy contracts
npx hardhat run scripts/deploy.js --network localhost

# Start frontend
npm run dev
```

### 2. MetaMask Configuration

Add Rayls Testnet to MetaMask:

```
Network Name: Rayls Testnet
RPC URL: https://devnet-rpc.rayls.com
Chain ID: 123123
Currency Symbol: USDgas
Block Explorer: https://devnet-explorer.rayls.com
```

### 3. Request Test Tokens

Contact Rayls team for testnet USDgas faucet.

## Performance Optimization

### 1. Web Worker for Proof Generation

Create `src/workers/zkProof.worker.js`:

```javascript
import { ZKProofGenerator } from "../utils/zkProof";

const generator = new ZKProofGenerator();

self.addEventListener("message", async (e) => {
  const { secret, nullifier, recipient, amount } = e.data;

  await generator.initialize();
  const result = await generator.generateProof({
    secret,
    nullifier,
    recipient,
    amount
  });

  self.postMessage(result);
});
```

Use in component:

```javascript
const worker = new Worker(new URL("../workers/zkProof.worker.js", import.meta.url));

worker.postMessage({ secret, nullifier, recipient, amount });
worker.onmessage = (e) => {
  const { proof, publicSignals } = e.data;
  // Continue with transaction...
};
```

### 2. Lazy Load Circuit Files

```javascript
async function loadCircuitArtifacts() {
  const [wasm, zkey, vkey] = await Promise.all([
    fetch("/circuits/privacy.wasm").then(r => r.arrayBuffer()),
    fetch("/circuits/privacy.zkey").then(r => r.arrayBuffer()),
    fetch("/circuits/verification_key.json").then(r => r.json())
  ]);
  return { wasm, zkey, vkey };
}
```

## Example Applications

### 1. Private Payment DApp

```javascript
// Send private payment
await client.sendPrivateMessage({
  destinationChainId: 789,
  destinationAddress: recipientAddress,
  encryptedPayload: encryptedAmount,
  secret: userSecret,
  nullifier: paymentNullifier,
  amount: paymentAmount
});
```

### 2. Anonymous Voting

```javascript
// Cast anonymous vote
const voteNullifier = deriveNullifier(voter, proposalId);
await client.sendPrivateMessage({
  destinationChainId: voteChainId,
  destinationAddress: votingContract,
  encryptedPayload: encryptedVote,
  secret: voterSecret,
  nullifier: voteNullifier,
  amount: 1n // 1 vote
});
```

### 3. Private Auctions

```javascript
// Submit sealed bid
await client.sendPrivateMessage({
  destinationChainId: auctionChainId,
  destinationAddress: auctionContract,
  encryptedPayload: encryptedBid,
  secret: bidderSecret,
  nullifier: bidNullifier,
  amount: bidAmount
});
```

## Troubleshooting

### Common Issues

1. **"Invalid proof" error**: Ensure circuit inputs match Poseidon hash outputs
2. **Gas estimation failed**: Increase gasLimit to 500000+
3. **Nullifier already used**: Generate new nullifier for each transaction
4. **WASM loading failed**: Check file paths in `public/circuits/`

### Debug Mode

```javascript
// Enable verbose logging
const client = new RaylsShieldClient(signer);
client.debug = true;
```

## Resources

- **Deployed Contracts**: See `deployments/raylsDevnet.json`
- **Explorer**: https://devnet-explorer.rayls.com
- **RPC**: https://devnet-rpc.rayls.com
- **Circom Docs**: https://docs.circom.io
- **snarkjs Docs**: https://github.com/iden3/snarkjs

## Support

For issues or questions:
- GitHub: https://github.com/Abenavidese/rayls-shield
- Documentation: See `NEXT_STEPS.md` for deployment details
