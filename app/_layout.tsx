import { QueryClientProvider } from "@tanstack/react-query";
import { Slot } from "expo-router";
import { WagmiProvider } from "wagmi";

import { queryClient, wagmiConfig } from "../lib/web3";

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <Slot />
      </WagmiProvider>
    </QueryClientProvider>
  );
}
