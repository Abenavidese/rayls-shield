// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockRaylsEndpoint
 * @notice Mock implementation of Rayls Endpoint for local testing
 * @dev Use this for testing before deploying to actual Rayls network
 */
contract MockRaylsEndpoint {
    mapping(bytes32 => address) public resourceIds;
    address[] public trustedExecutors;

    event MessageSent(uint256 dstChainId, address destination, bytes payload);
    event MessageSentToResource(uint256 dstChainId, bytes32 resourceId, bytes payload);

    function send(
        uint256 _dstChainId,
        address _destination,
        bytes calldata _payload
    ) external payable returns (bytes32) {
        emit MessageSent(_dstChainId, _destination, _payload);
        return keccak256(abi.encodePacked(block.timestamp, msg.sender, _dstChainId));
    }

    function sendBatch(
        DestinationPayloadRequest[] calldata _requests
    ) external returns (bytes32) {
        for (uint i = 0; i < _requests.length; i++) {
            emit MessageSent(_requests[i]._dstChainId, _requests[i]._destination, _requests[i]._payload);
        }
        return keccak256(abi.encodePacked(block.timestamp, msg.sender));
    }

    function sendToResourceId(
        uint256 _dstChainId,
        bytes32 _resourceId,
        bytes calldata _payload
    ) external payable returns (bytes32) {
        emit MessageSentToResource(_dstChainId, _resourceId, _payload);
        return keccak256(abi.encodePacked(block.timestamp, msg.sender, _resourceId));
    }

    function sendBatchToResourceId(
        ResourceIdPayloadRequest[] calldata _requests
    ) external payable returns (bytes32) {
        for (uint i = 0; i < _requests.length; i++) {
            emit MessageSentToResource(_requests[i]._dstChainId, _requests[i]._resourceId, _requests[i]._payload);
        }
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
        return 1; // Mock commit chain ID
    }

    function getChainId() external view returns (uint256) {
        return block.chainid;
    }

    function getInboundNonce(uint256) external pure returns (uint256) {
        return 0;
    }

    function getOutboundNonce(uint256) external pure returns (uint256) {
        return 0;
    }

    function addTrustedExecutor(address _executor) external {
        trustedExecutors.push(_executor);
    }
}

// Support structs from Rayls
struct DestinationPayloadRequest {
    uint256 _dstChainId;
    address _destination;
    bytes _payload;
}

struct ResourceIdPayloadRequest {
    uint256 _dstChainId;
    bytes32 _resourceId;
    bytes _payload;
}
