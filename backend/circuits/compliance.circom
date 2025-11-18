pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

/**
 * @title ComplianceCircuit
 * @notice Zero-Knowledge circuit for compliant private transactions
 * @dev Proves transaction amount is below AML threshold without revealing exact amount
 *
 * Public Inputs:
 * - nullifierHash: Hash of the nullifier (prevents double-spending)
 * - commitment: Commitment to the transaction
 * - recipientHash: Hash of the recipient address
 * - amlThreshold: Anti-Money Laundering threshold (e.g., 10,000 USD)
 *
 * Private Inputs:
 * - secret: Secret value known only to sender
 * - nullifier: Unique value to prevent replay
 * - recipient: Actual recipient address
 * - amount: Amount being transferred
 *
 * Constraints:
 * - amount < amlThreshold (compliance check)
 * - amount > 0 (no zero/negative amounts)
 */

template ComplianceCircuit() {
    // Public inputs
    signal input nullifierHash;
    signal input commitment;
    signal input recipientHash;
    signal input amlThreshold;

    // Private inputs
    signal input secret;
    signal input nullifier;
    signal input recipient;
    signal input amount;

    // Internal signals
    signal commitmentHash;
    signal computedNullifierHash;
    signal computedRecipientHash;

    // Component declarations
    component poseidon1 = Poseidon(3);
    component poseidon2 = Poseidon(1);
    component poseidon3 = Poseidon(1);

    // Compute commitment: Poseidon(secret, nullifier, amount)
    poseidon1.inputs[0] <== secret;
    poseidon1.inputs[1] <== nullifier;
    poseidon1.inputs[2] <== amount;
    commitmentHash <== poseidon1.out;

    // Verify commitment matches public input
    commitment === commitmentHash;

    // Compute nullifier hash: Poseidon(nullifier)
    poseidon2.inputs[0] <== nullifier;
    computedNullifierHash <== poseidon2.out;

    // Verify nullifier hash matches public input
    nullifierHash === computedNullifierHash;

    // Compute recipient hash: Poseidon(recipient)
    poseidon3.inputs[0] <== recipient;
    computedRecipientHash <== poseidon3.out;

    // Verify recipient hash matches public input
    recipientHash === computedRecipientHash;

    // Constraint: amount must be non-negative (simplified range check)
    component amountBits = Num2Bits(64);
    amountBits.in <== amount;

    // AML Compliance: amount < amlThreshold
    component lessThan = LessThan(64);
    lessThan.in[0] <== amount;
    lessThan.in[1] <== amlThreshold;
    lessThan.out === 1;

    // Additional constraint: amount > 0
    component greaterThan = GreaterThan(64);
    greaterThan.in[0] <== amount;
    greaterThan.in[1] <== 0;
    greaterThan.out === 1;
}

component main {public [nullifierHash, commitment, recipientHash, amlThreshold]} = ComplianceCircuit();
