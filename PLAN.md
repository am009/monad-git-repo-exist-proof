# HackStamp Current Plan

## Goal

Build a minimal hackathon project submission proof page:

- User enters a GitHub repository URL and a commit hash
- The app validates the commit hash format
- It generates shareable GitHub tree / ZIP / clone details
- After connecting a browser wallet, the commit hash is anchored on-chain

## Current Page Structure

- Centered large title
- Two input fields
- One validate / generate button
- Two sections appear after submission:
  - On-chain submission preview
  - Hash validation result

## What Is Already Implemented

- GitHub repository URL parsing
- Commit hash format validation
- Tree / ZIP / clone preview generation
- White minimalist theme
- Web browser wallet connection to Monad Testnet

## Next Steps

1. Polish wallet connection and on-chain submission feedback
2. Add a clearer transaction receipt display
3. Add a query entry point if needed

## Interaction Principles

- Keep a single entry point
- Avoid complex card flows
- Split results into only two panels
- Focus on hackathon submission proof, not a generalized existence proof
- Do not persist local history
- Use the GitHub URL for display only, not for backend or contract input
- Do not rely on Privy login flows

## Risk Notes

- Do not rely on history after a force push
- Do not fake an old proof by reverting or rewriting history
- Treat any commit hash change as a new version
