# HackStampRegistry

This folder contains a single Solidity contract:

- `HackStampRegistry.sol`

Deployed on Monad Testnet:

- `0x1ECd868F6F08cAD2239b900cc756294149Fb6B7F`

## What it does

- Stores hackathon submission proofs onchain
- Lets you query by commit hash
- Lets you enumerate all stored proofs

## How to deploy with Remix

1. Open [Remix](https://remix.ethereum.org/)
2. Create a new file named `HackStampRegistry.sol`
3. Paste the contents of `contracts/HackStampRegistry.sol`
4. Compile with Solidity `0.8.24`
5. Connect your wallet
6. Deploy to Monad testnet

## Suggested constructor

This contract has no constructor.

## Suggested usage

- `submitProof(commitHash, treeHash, repo)` to store a proof
- `getProofByCommit(commitHash)` to query a proof
- `proofCount()` and `proofAt(index)` to enumerate all records
