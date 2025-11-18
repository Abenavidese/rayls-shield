# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a Rayls Protocol development environment. Rayls is a Solidity-based cross-chain messaging protocol that enables communication between different blockchain networks. The repository depends on the `@rayls/contracts` package which contains the core protocol contracts.

## Architecture

### Core Protocol Components

**RaylsApp** (`@rayls/contracts/RaylsApp.sol`)
- Abstract base contract that all Rayls applications must inherit from
- Provides cross-chain messaging functionality via the RaylsEndpoint
- Key methods:
  - `_raylsSend()` - Send single message to destination address
  - `_raylsSendBatch()` - Send multiple messages
  - `_raylsSendToResourceId()` - Send message to a resourceId (cross-chain identifier)
  - `_raylsSendBatchToResourceId()` - Send batch to resourceId
  - `_registerResourceId()` - Associate contract address with resourceId
- Includes modifiers `receiveMethod` and `onlyFromCommitChain` for access control
- Provides helper methods to extract metadata from calldata during cross-chain calls:
  - `_getMessageIdOnReceiveMethod()` - Extract messageId from receive calls
  - `_getFromChainIdOnReceiveMethod()` - Extract source chain ID
  - `_getMsgSenderOnReceiveMethod()` - Extract original sender address
  - `_getResourceIdOnInitialize()` - Extract resourceId during initialization
  - `_getOwnerAddressOnInitialize()` - Extract owner during initialization
  - `_getEndpointAddressOnInitialize()` - Extract endpoint during initialization

**IRaylsEndpoint** (`@rayls/contracts/interfaces/IRaylsEndpoint.sol`)
- Core interface for the Rayls messaging endpoint
- Handles message sending, receiving, nonce management, and resourceId registration
- Key methods:
  - `send()` - Send message to destination address
  - `sendBatch()` - Send multiple messages
  - `sendToResourceId()` - Send to resourceId instead of address
  - `receivePayload()` - Receive cross-chain messages
  - `registerResourceId()` - Map resourceId to implementation address
  - `getInboundNonce()` / `getOutboundNonce()` - Track message ordering
  - `getCommitChainId()` - Get the commit chain identifier
  - `isTrustedExecutor()` - Verify executor permissions

**RaylsMessage** (`@rayls/contracts/RaylsMessage.sol`)
- Defines the message structure for cross-chain communication
- Contains metadata including nonce, resourceId, lock data, revert payloads, and transfer metadata
- Supports deployment of new resources on destination chains via `NewResourceMetadata`
- Includes structs for bridged token transfers (`BridgedTransferMetadata`)

**MessageLib** (`@rayls/contracts/libraries/MessageLib.sol`)
- Library for message computation and execution
- Key functions:
  - `computeMessageId()` - Generate unique message identifiers
  - `executeMessage()` - Execute received messages with proper encoding
  - Message calls append metadata (messageId, fromChainId, from) to calldata

**Token Handlers**
- Pre-built handlers for bridging ERC20, ERC721, ERC1155, and Enygma tokens
- Extend RaylsApp and respective token standards
- Handle locking/unlocking tokens during cross-chain transfers
- Located in `@rayls/contracts/tokens/`

### ResourceId System

The protocol uses a `resourceId` (bytes32) to identify contracts across multiple chains instead of relying on addresses. This allows:
- Calling the same logical contract on different chains without knowing specific addresses
- Deploying resources dynamically on destination chains
- Creating truly cross-chain applications

### Message Flow

1. **Sending**: Contract inheriting RaylsApp calls `_raylsSend*()` methods
2. **Endpoint**: RaylsEndpoint validates and emits message with nonce
3. **Off-chain**: Relayers pick up messages and relay to destination chain
4. **Receiving**: Destination endpoint calls `receivePayload()` and executes message
5. **Execution**: Target contract's receive method is called with metadata appended to calldata

### Commit Chain Architecture

The protocol has a designated "commit chain" (retrieved via `endpoint.getCommitChainId()`) which serves as the source of truth for certain operations. Use the `onlyFromCommitChain` modifier to restrict methods to only accept calls from the commit chain.

## Development

### Project Structure

```
@rayls/contracts/
├── RaylsApp.sol              # Base contract for all Rayls applications
├── RaylsAppV1.sol           # Version 1 implementation
├── RaylsMessage.sol         # Message structures and enums
├── Constants.sol            # Protocol constants
├── contracts/               # Additional contract implementations
├── interfaces/              # Protocol interfaces
│   ├── IRaylsEndpoint.sol
│   ├── IRaylsMessageExecutor.sol
│   └── ...
├── libraries/               # Shared libraries
│   ├── MessageLib.sol       # Message computation and execution
│   ├── SharedObjects.sol
│   └── Utils.sol
└── tokens/                  # Token bridge handlers
    ├── RaylsErc20Handler.sol
    ├── RaylsErc721Handler.sol
    ├── RaylsErc1155Handler.sol
    └── ...
```

### Creating a Rayls Application

1. Import and inherit from `RaylsApp`:
```solidity
import "@rayls/contracts/RaylsApp.sol";

contract MyApp is RaylsApp {
    constructor(address _endpoint) RaylsApp(_endpoint) {}
}
```

2. Use `_raylsSend*()` methods to send cross-chain messages
3. Implement receive methods with the `receiveMethod` modifier
4. Extract cross-chain metadata using `_get*OnReceiveMethod()` helpers
5. Optionally register a resourceId using `_registerResourceId()`

### Important Implementation Details

- When implementing receive methods, the endpoint automatically appends metadata to calldata: `(messageId, fromChainId, from)`
- All token handlers are initializable and upgradeable (use OpenZeppelin's upgrade pattern)
- Messages include optional `lockData` for locking assets until confirmation
- Revert payloads (`revertDataPayloadSender`, `revertDataPayloadReceiver`) handle cross-chain failures
- The protocol uses OpenZeppelin Contracts v5.0.1 (both standard and upgradeable)

### Dependencies

- `@openzeppelin/contracts` ^5.0.1
- `@openzeppelin/contracts-upgradeable` ^5.0.1

---

## RaylsShield Hackathon Project

This repository contains **RaylsShield**, a Zero-Knowledge privacy layer for Rayls Protocol built for a hackathon submission.

### Project Overview

RaylsShield adds privacy-preserving capabilities to cross-chain messaging on Rayls using ZK-SNARKs (Groth16 proofs via Circom circuits). It enables private transactions while maintaining verifiability and compliance.

### Key Features

- **Zero-Knowledge Proofs**: Privacy-preserving transaction verification using Circom circuits
- **Cross-Chain Privacy**: Private messaging across blockchains via Rayls Protocol
- **Verifiable Compliance**: Prove transaction validity without revealing sensitive details
- **Nullifier System**: Prevent double-spending and replay attacks

### Project Structure

```
RaylsShield/
├── contracts/
│   ├── RaylsShield.sol           # Main privacy contract (extends RaylsApp)
│   ├── Groth16Verifier.sol       # ZK proof verifier
│   └── MockRaylsEndpoint.sol     # Mock endpoint for local testing
├── circuits/
│   ├── privacy.circom            # ZK circuit for private messaging
│   └── input.json                # Example circuit inputs
├── scripts/
│   └── deploy.js                 # Deployment script for Rayls Devnet
├── test/
│   └── RaylsShield.test.js       # Contract tests
└── hardhat.config.js             # Hardhat + Circom configuration
```

### Development Commands

#### Smart Contracts

```bash
# Compile contracts
npx hardhat compile

# Run tests
npx hardhat test

# Deploy to Rayls Devnet
npx hardhat run scripts/deploy.js --network raylsDevnet

# Deploy to local network
npx hardhat run scripts/deploy.js --network localhost
```

#### ZK Circuits

```bash
# Compile Circom circuits
npx hardhat circom

# This will:
# - Compile privacy.circom to R1CS
# - Generate WASM witness calculator
# - Generate proving/verification keys
# - Create Solidity verifier contract
```

### Rayls Devnet Configuration

- **Chain ID**: 123123
- **RPC URL**: https://devnet-rpc.rayls.com
- **Explorer**: https://devnet-explorer.rayls.com
- **Gas Token**: USDgas

### RaylsShield Contract Architecture

**RaylsShield.sol** extends `RaylsApp` and implements:

1. **sendPrivateMessage()**: Send encrypted cross-chain message with ZK proof
   - Verifies ZK proof before sending
   - Stores commitment to prevent tampering
   - Uses `_raylsSend()` for cross-chain delivery

2. **receivePrivateMessage()**: Receive and verify private message
   - Checks nullifier to prevent replay attacks
   - Verifies ZK proof on-chain
   - Processes encrypted payload

3. **sendPrivateMessageToResource()**: Send to resourceId with privacy
   - Uses resourceId system for cross-chain contract addressing
   - Maintains same privacy guarantees

### ZK Circuit (privacy.circom)

The privacy circuit proves knowledge of:
- **Private inputs**: secret, nullifier, recipient, amount
- **Public inputs**: nullifierHash, commitment, recipientHash

**Constraints**:
- Commitment = Poseidon(secret, nullifier, amount)
- NullifierHash = Poseidon(nullifier)
- RecipientHash = Poseidon(recipient)
- Amount must be non-negative (range check)

### Testing Workflow

1. **Local Testing**:
   ```bash
   # Start local Hardhat node
   npx hardhat node

   # Deploy to local network (uses MockRaylsEndpoint)
   npx hardhat run scripts/deploy.js --network localhost

   # Run tests
   npx hardhat test
   ```

2. **Rayls Devnet Testing**:
   ```bash
   # Set private key in .env
   echo "PRIVATE_KEY=your_key_here" > .env

   # Set Rayls endpoint address (get from Rayls docs)
   echo "RAYLS_ENDPOINT_ADDRESS=0x..." >> .env

   # Deploy to Rayls Devnet
   npx hardhat run scripts/deploy.js --network raylsDevnet
   ```

### Environment Setup

Create `.env` file (use `.env.example` as template):

```bash
PRIVATE_KEY=your_wallet_private_key
RAYLS_ENDPOINT_ADDRESS=actual_rayls_endpoint_address
RAYLS_EXPLORER_API_KEY=your_api_key_if_available
```

### Security Considerations

- Never commit `.env` file with real keys
- Audit ZK circuits thoroughly before mainnet deployment
- Test nullifier uniqueness to prevent double-spending
- Verify all proofs on-chain before executing transactions
- Use MockRaylsEndpoint only for local testing

### Next Steps for Production

1. Get actual Rayls Endpoint address from Rayls team
2. Complete Circom circuit compilation with proper setup ceremony
3. Generate production-ready proving and verification keys
4. Deploy verifier contract generated by snarkjs
5. Integrate with Rayls Proof-of-Usage system
6. Comprehensive security audit
