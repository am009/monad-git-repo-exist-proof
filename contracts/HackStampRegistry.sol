// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title HackStampRegistry
/// @notice Minimal onchain registry for hackathon submission proofs.
/// @dev Stores append-only proof records and allows lookup by commit hash.
contract HackStampRegistry {
    struct Proof {
        bytes20 commitHash;
        bytes20 treeHash;
        address submitter;
        uint64 submittedAt;
        string repo;
    }

    Proof[] private _proofs;
    mapping(bytes20 => uint256) private _indexOf; // commitHash => proof index + 1

    event ProofStored(
        bytes20 indexed commitHash,
        bytes20 indexed treeHash,
        address indexed submitter,
        string repo,
        uint256 proofId,
        uint64 submittedAt
    );

    error ProofAlreadyExists(bytes20 commitHash);
    error ProofNotFound(bytes20 commitHash);
    error RangeTooLarge(uint256 requested);

    /// @notice Store a proof record onchain.
    /// @param commitHash Git commit hash as bytes20.
    /// @param treeHash Git tree hash as bytes20.
    /// @param repo GitHub repository identifier, for example "owner/repo".
    function submitProof(
        bytes20 commitHash,
        bytes20 treeHash,
        string calldata repo
    ) external {
        if (_indexOf[commitHash] != 0) {
            revert ProofAlreadyExists(commitHash);
        }

        uint64 submittedAt = uint64(block.timestamp);

        _proofs.push(
            Proof({
                commitHash: commitHash,
                treeHash: treeHash,
                submitter: msg.sender,
                submittedAt: submittedAt,
                repo: repo
            })
        );

        uint256 proofId = _proofs.length - 1;
        _indexOf[commitHash] = proofId + 1;

        emit ProofStored(commitHash, treeHash, msg.sender, repo, proofId, submittedAt);
    }

    /// @notice Return the number of stored proofs.
    function proofCount() external view returns (uint256) {
        return _proofs.length;
    }

    /// @notice Return the proof at a specific index.
    function proofAt(uint256 index) external view returns (Proof memory) {
        return _proofs[index];
    }

    /// @notice Return a proof by commit hash.
    function getProofByCommit(bytes20 commitHash) external view returns (Proof memory) {
        uint256 indexPlusOne = _indexOf[commitHash];
        if (indexPlusOne == 0) {
            revert ProofNotFound(commitHash);
        }

        return _proofs[indexPlusOne - 1];
    }

    /// @notice Check whether a commit hash has already been stored.
    function exists(bytes20 commitHash) external view returns (bool) {
        return _indexOf[commitHash] != 0;
    }

    /// @notice Return a slice of the stored proofs.
    function proofsRange(
        uint256 start,
        uint256 count
    ) external view returns (Proof[] memory result) {
        uint256 length = _proofs.length;
        if (start >= length) {
            return new Proof[](0);
        }

        uint256 end = start + count;
        if (end > length) {
            end = length;
        }

        uint256 sliceLength = end - start;
        if (sliceLength > type(uint32).max) {
            revert RangeTooLarge(sliceLength);
        }

        result = new Proof[](sliceLength);
        for (uint256 i = start; i < end; i++) {
            result[i - start] = _proofs[i];
        }
    }
}
