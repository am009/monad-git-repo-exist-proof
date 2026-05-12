import { QueryClient } from "@tanstack/react-query";
import { createConfig, http, injected } from "wagmi";
import { monadTestnet } from "viem/chains";

export const HACKSTAMP_REGISTRY_ADDRESS =
  "0x1ECd868F6F08cAD2239b900cc756294149Fb6B7F";

export const HACKSTAMP_REGISTRY_ABI = [
  {
    type: "function",
    name: "submitProof",
    stateMutability: "nonpayable",
    inputs: [
      { name: "commitHash", type: "bytes20" },
      { name: "treeHash", type: "bytes20" },
      { name: "repo", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "exists",
    stateMutability: "view",
    inputs: [{ name: "commitHash", type: "bytes20" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "getProofByCommit",
    stateMutability: "view",
    inputs: [{ name: "commitHash", type: "bytes20" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "commitHash", type: "bytes20" },
          { name: "treeHash", type: "bytes20" },
          { name: "submitter", type: "address" },
          { name: "submittedAt", type: "uint64" },
          { name: "repo", type: "string" },
        ],
      },
    ],
  },
] as const;

export const wagmiConfig = createConfig({
  chains: [monadTestnet],
  connectors: [injected()],
  transports: {
    [monadTestnet.id]: http(monadTestnet.rpcUrls.default.http[0]),
  },
});

export const queryClient = new QueryClient();

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
