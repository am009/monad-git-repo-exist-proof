import { useEffect, useState } from "react";
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { monadTestnet } from "viem/chains";
import { getAddress } from "viem";
import {
  useAccount,
  useConnect,
  useDisconnect,
  usePublicClient,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

import {
  HACKSTAMP_REGISTRY_ABI,
  HACKSTAMP_REGISTRY_ADDRESS,
} from "../lib/web3";

type RepositoryParts = {
  owner: string;
  repoName: string;
  repoUrl: string;
};

type SubmissionRecord = {
  repoUrl: string;
  repoName: string;
  repoSlug: string;
  commitHash: string;
  treeUrl: string;
  zipUrl: string;
  cloneCommand: string;
};

type OnchainProof = {
  commitHash: `0x${string}`;
  treeHash: `0x${string}`;
  submitter: `0x${string}`;
  submittedAt: bigint;
  repo: string;
};

type OnchainLookupState =
  | {
      status: "idle";
      proof: null;
      message: null;
    }
  | {
      status: "checking";
      proof: null;
      message: string;
    }
  | {
      status: "found";
      proof: OnchainProof;
      message: string;
    }
  | {
      status: "not_found";
      proof: null;
      message: string;
    }
  | {
      status: "error";
      proof: null;
      message: string;
    };

const ZERO_BYTES20 =
  "0x0000000000000000000000000000000000000000" as const;
const SAMPLE_REPO_URL =
  "https://github.com/NomicFoundation/solx";
const SAMPLE_COMMIT_HASH =
  "f0f73f9e8bda8aaf6ead699672ac41167c42c490";
const PUBLIC_REPO_URL =
  "https://github.com/am009/monad-git-repo-exist-proof";
const OKX_SKILL_NOTE =
  "plugin-store skill installed with npx skills add okx/plugin-store --skill plugin-store";
type QueryParamValue = string | string[] | undefined;

function firstQueryValue(value: QueryParamValue) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function normalizeRepoQueryValue(input: string) {
  const trimmed = input.trim();

  if (!trimmed) {
    return "";
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (/^github\.com\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }

  if (/^[^/]+\/[^/]+$/.test(trimmed)) {
    return `https://github.com/${trimmed}`;
  }

  return trimmed;
}

function normalizeContractAddress(input: string) {
  return getAddress(input.trim());
}

function normalizeGitHubRepoUrl(input: string): RepositoryParts {
  const trimmed = input.trim().replace(/\.git$/i, "");

  if (!trimmed) {
    throw new Error("Please enter a GitHub repository URL");
  }

  const normalized = trimmed.match(/^https?:\/\//i)
    ? trimmed
    : `https://${trimmed.replace(/^github\.com\//i, "github.com/")}`;

  const url = new URL(normalized);
  const host = url.hostname.toLowerCase();

  if (host !== "github.com" && host !== "www.github.com") {
    throw new Error("The repository URL must be a GitHub URL");
  }

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length !== 2) {
    throw new Error("Please enter the GitHub repository homepage URL, not a tree/blob page");
  }

  const owner = parts[0];
  const repoName = parts[1];
  const repoUrl = `https://github.com/${owner}/${repoName}`;

  return { owner, repoName, repoUrl };
}

function normalizeCommitHash(input: string): string {
  const trimmed = input.trim().toLowerCase().replace(/^0x/, "");

  if (!/^[0-9a-f]{40}$/.test(trimmed)) {
    throw new Error("The commit hash must be a 40-character Git SHA1");
  }

  return trimmed;
}

function buildSubmissionRecord(
  repo: RepositoryParts,
  commitHash: string,
): SubmissionRecord {
  const treeUrl = `${repo.repoUrl}/tree/${commitHash}`;
  const zipUrl = `${repo.repoUrl}/archive/${commitHash}.zip`;
  const cloneCommand = `git clone ${repo.repoUrl}.git && cd ${repo.repoName} && git checkout ${commitHash}`;

  return {
    repoUrl: repo.repoUrl,
    repoName: repo.repoName,
    repoSlug: `${repo.owner}/${repo.repoName}`,
    commitHash,
    treeUrl,
    zipUrl,
    cloneCommand,
  };
}

function shortenAddress(address: string, prefixLength = 6, suffixLength = 4) {
  if (address.length <= prefixLength + suffixLength) {
    return address;
  }

  return `${address.slice(0, prefixLength)}…${address.slice(-suffixLength)}`;
}

function formatTxUrl(hash: string) {
  return `https://testnet.monadvision.com/tx/${hash}`;
}

function formatSubmittedAt(submittedAt: bigint) {
  return new Date(Number(submittedAt) * 1000).toLocaleString("en-US", {
    hour12: false,
  });
}

export default function Index() {
  const searchParams = useLocalSearchParams<Record<string, QueryParamValue>>();
  const queryRepo = firstQueryValue(
    searchParams.repo ?? searchParams.repoUrl ?? searchParams.repository,
  );
  const queryHash = firstQueryValue(
    searchParams.hash ?? searchParams.commitHash,
  );
  const queryContractAddress = firstQueryValue(
    searchParams.contractAddress ??
      searchParams.contract ??
      searchParams.registryAddress ??
      searchParams.address,
  );

  const [repoUrlInput, setRepoUrlInput] = useState("");
  const [commitHashInput, setCommitHashInput] = useState("");
  const [currentRecord, setCurrentRecord] = useState<SubmissionRecord | null>(
    null,
  );
  const [submittedHash, setSubmittedHash] = useState<`0x${string}` | null>(
    null,
  );
  const [isCheckingOnchain, setIsCheckingOnchain] = useState(false);
  const [registryAddress, setRegistryAddress] = useState(
    HACKSTAMP_REGISTRY_ADDRESS,
  );
  const [onchainLookup, setOnchainLookup] = useState<OnchainLookupState>({
    status: "idle",
    proof: null,
    message: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { address, chainId, isConnected } = useAccount();
  const {
    connect,
    connectors,
    error: connectError,
    isPending: isConnecting,
  } = useConnect();
  const { disconnect } = useDisconnect();
  const {
    switchChain,
    error: switchChainError,
    isPending: isSwitchingChain,
  } = useSwitchChain();
  const {
    writeContractAsync,
    error: writeContractError,
    isPending: isSubmitting,
  } = useWriteContract();
  const publicClient = usePublicClient();
  const {
    data: receipt,
    error: receiptError,
    isPending: isReceiptQueryPending,
  } = useWaitForTransactionReceipt({
    hash: submittedHash ?? undefined,
  });

  const canUseInjectedWallet = Platform.OS === "web";
  const isOnMonadTestnet = chainId === monadTestnet.id;
  const isWaitingForReceipt = Boolean(submittedHash) && isReceiptQueryPending;
  const txUrl = submittedHash ? formatTxUrl(submittedHash) : null;
  const connectConnector = connectors.find((item) => item.id === "injected") ??
    connectors[0];

  useEffect(() => {
    console.log("[HackStamp] wallet state", {
      isConnected,
      address,
      chainId,
      isOnMonadTestnet,
    });
  }, [address, chainId, isConnected, isOnMonadTestnet]);

  useEffect(() => {
    if (!currentRecord) {
      return;
    }

    console.log("[HackStamp] preview ready", {
      repoUrl: currentRecord.repoUrl,
      repoName: currentRecord.repoName,
      commitHash: currentRecord.commitHash,
      treeUrl: currentRecord.treeUrl,
    });
  }, [currentRecord]);

  useEffect(() => {
    setError(null);
    setNotice(null);
    setCurrentRecord(null);
    setSubmittedHash(null);
    setOnchainLookup({
      status: "idle",
      proof: null,
      message: null,
    });

    if (queryRepo) {
      setRepoUrlInput(normalizeRepoQueryValue(queryRepo));
    } else {
      setRepoUrlInput("");
    }

    if (queryHash) {
      setCommitHashInput(queryHash.trim());
    } else {
      setCommitHashInput("");
    }

    if (queryContractAddress) {
      try {
        setRegistryAddress(normalizeContractAddress(queryContractAddress));
      } catch {
        setError("The contract address in the query string is invalid.");
        setRegistryAddress(HACKSTAMP_REGISTRY_ADDRESS);
      }
    } else {
      setRegistryAddress(HACKSTAMP_REGISTRY_ADDRESS);
    }
  }, [queryContractAddress, queryHash, queryRepo]);

  useEffect(() => {
    if (!submittedHash) {
      return;
    }

    console.log("[HackStamp] tx hash received", {
      submittedHash,
      txUrl: formatTxUrl(submittedHash),
    });
  }, [submittedHash]);

  useEffect(() => {
    if (!receipt) {
      return;
    }

    console.log("[HackStamp] receipt update", {
      status: receipt.status,
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber?.toString(),
    });
  }, [receipt]);

  function handleFillSample() {
    setError(null);
    setNotice(null);
    setCurrentRecord(null);
    setSubmittedHash(null);
    setOnchainLookup({
      status: "idle",
      proof: null,
      message: null,
    });
    setRepoUrlInput(SAMPLE_REPO_URL);
    setCommitHashInput(SAMPLE_COMMIT_HASH);
  }

  async function handleGenerate() {
    setError(null);
    setNotice(null);
    setSubmittedHash(null);
    setOnchainLookup({
      status: "idle",
      proof: null,
      message: null,
    });

    console.log("[HackStamp] generate clicked", {
      repoUrlInput,
      commitHashInput,
    });

    let repo: RepositoryParts;
    let commitHash: string;

    try {
      repo = normalizeGitHubRepoUrl(repoUrlInput);
    } catch (repoError) {
      console.log("[HackStamp] repo validation failed", repoError);
      setError(
        repoError instanceof Error ? repoError.message : "Invalid GitHub URL",
      );
      return;
    }

    try {
      commitHash = normalizeCommitHash(commitHashInput);
    } catch (hashError) {
      console.log("[HackStamp] hash validation failed", hashError);
      setError(
        hashError instanceof Error ? hashError.message : "Invalid commit hash",
      );
      return;
    }

    const nextRecord = buildSubmissionRecord(repo, commitHash);
    console.log("[HackStamp] preview built", nextRecord);
    setCurrentRecord(nextRecord);

    if (!publicClient) {
      setError("No RPC client is available in the current environment, so on-chain records cannot be checked.");
      return;
    }

    const normalizedCommitHash = `0x${commitHash}` as const;
    setIsCheckingOnchain(true);
    setOnchainLookup({
      status: "checking",
      proof: null,
      message: "Checking whether this commit hash already exists on-chain.",
    });
    setNotice("Preview link generated. Checking on-chain records.");

    console.log("[HackStamp] onchain lookup started", {
      commitHash: normalizedCommitHash,
      repoSlug: nextRecord.repoSlug,
    });

    try {
      const exists = await publicClient.readContract({
        abi: HACKSTAMP_REGISTRY_ABI,
        address: registryAddress,
        functionName: "exists",
        args: [normalizedCommitHash],
      });

      console.log("[HackStamp] onchain existence checked", {
        commitHash: normalizedCommitHash,
        exists,
      });

      if (!exists) {
        setOnchainLookup({
          status: "not_found",
          proof: null,
          message: "This hash has not been submitted on-chain yet.",
        });
        setNotice("Preview link generated. This hash is not on-chain yet.");
        return;
      }

      const proof = await publicClient.readContract({
        abi: HACKSTAMP_REGISTRY_ABI,
        address: registryAddress,
        functionName: "getProofByCommit",
        args: [normalizedCommitHash],
      });

      const normalizedProof: OnchainProof = {
        commitHash: proof.commitHash,
        treeHash: proof.treeHash,
        submitter: proof.submitter,
        submittedAt: proof.submittedAt,
        repo: proof.repo,
      };

      console.log("[HackStamp] onchain proof loaded", {
        commitHash: normalizedProof.commitHash,
        submitter: normalizedProof.submitter,
        submittedAt: normalizedProof.submittedAt.toString(),
        repo: normalizedProof.repo,
      });

      setOnchainLookup({
        status: "found",
        proof: normalizedProof,
        message: "This hash is already on-chain.",
      });
      setNotice("Preview link generated. This hash is already registered on-chain.");
    } catch (lookupError) {
      console.log("[HackStamp] onchain lookup failed", lookupError);
      setOnchainLookup({
        status: "error",
        proof: null,
        message:
          lookupError instanceof Error
            ? lookupError.message
            : "On-chain query failed",
      });
      setNotice("Preview link generated, but the on-chain check failed.");
    } finally {
      setIsCheckingOnchain(false);
    }
  }

  async function handleConnectWallet() {
    setError(null);
    setNotice(null);
    console.log("[HackStamp] connect wallet clicked", {
      hasConnector: Boolean(connectConnector),
      connectorId: connectConnector?.id,
    });

    if (!canUseInjectedWallet) {
      setError("This version only supports web browser wallets.");
      return;
    }

    if (!connectConnector) {
      setError("No wallet extension was found. Install MetaMask or a similar browser wallet.");
      return;
    }

    console.log("[HackStamp] requesting wallet connection");
    connect({ connector: connectConnector });
  }

  async function handleSwitchChain() {
    setError(null);
    setNotice(null);

    console.log("[HackStamp] switch chain requested", {
      targetChainId: monadTestnet.id,
      currentChainId: chainId,
    });

    switchChain({ chainId: monadTestnet.id });
  }

  async function handleSubmitOnchain() {
    setError(null);
    setNotice(null);
    setSubmittedHash(null);

    console.log("[HackStamp] submit clicked", {
      hasPreview: Boolean(currentRecord),
      isConnected,
      address,
      chainId,
      isOnMonadTestnet,
    });

    if (!currentRecord) {
      setError("Generate the commit hash preview first.");
      return;
    }

    if (!isConnected || !address) {
      setError("Connect your wallet first.");
      return;
    }

    if (!isOnMonadTestnet) {
      setError("Switch to Monad Testnet first.");
      return;
    }

    try {
      // The deployed registry still expects tree/repo fields; commit hash is the only meaningful payload here.
      console.log("[HackStamp] sending contract write", {
        address: registryAddress,
        commitHash: currentRecord.commitHash,
        repo: currentRecord.repoSlug,
      });
      const txHash = await writeContractAsync({
        abi: HACKSTAMP_REGISTRY_ABI,
        address: registryAddress,
        functionName: "submitProof",
        args: [
          `0x${currentRecord.commitHash}` as `0x${string}`,
          ZERO_BYTES20,
          currentRecord.repoSlug,
        ],
      });

      console.log("[HackStamp] contract write sent", {
        txHash,
        txUrl: formatTxUrl(txHash),
      });
      setSubmittedHash(txHash);
      setNotice("Transaction sent. Waiting for on-chain confirmation.");
    } catch (submitError) {
      console.log("[HackStamp] submit failed", submitError);
      setError(
        submitError instanceof Error ? submitError.message : "Transaction submission failed",
      );
    }
  }

  const statusLabel = isConnected
    ? `${shortenAddress(address ?? "")} · ${isOnMonadTestnet ? "Monad Testnet" : "Wrong network"}`
    : "Wallet not connected";

  const panelStatus = receipt
    ? receipt.status === "success"
      ? "Confirmed"
      : "Transaction failed"
    : submittedHash
      ? isWaitingForReceipt
        ? "Awaiting confirmation"
        : "Sent"
      : "Not submitted";

  const submitButtonLabel = isSubmitting
    ? "Waiting for wallet confirmation..."
    : submittedHash && isWaitingForReceipt
      ? "Sent, waiting for confirmation..."
      : receipt?.status === "success"
        ? "Confirmed"
        : "Submit on-chain";

  const submitDisabled =
    !currentRecord ||
    !isConnected ||
    !isOnMonadTestnet ||
    isSubmitting ||
    isWaitingForReceipt ||
    receipt?.status === "success";

  const submitBlockers = [
    !currentRecord ? "no_preview" : null,
    !isConnected ? "wallet_disconnected" : null,
    isConnected && !isOnMonadTestnet ? "wrong_chain" : null,
    isSubmitting ? "wallet_confirming" : null,
    isWaitingForReceipt ? "waiting_receipt" : null,
    receipt?.status === "success" ? "already_confirmed" : null,
  ].filter(Boolean);

  const submitBlockerMessages = submitBlockers.map((blocker) => {
    switch (blocker) {
      case "no_preview":
        return "No commit preview has been generated yet";
      case "wallet_disconnected":
        return "Wallet is disconnected";
      case "wrong_chain":
        return "Current network is not Monad Testnet";
      case "wallet_confirming":
        return "Wallet is confirming the transaction";
      case "waiting_receipt":
        return "Transaction sent, waiting for on-chain receipt";
      case "already_confirmed":
        return "This submission is already confirmed. Change the commit hash to submit again";
      default:
        return blocker;
    }
  });
  const submitBlockerSummary = submitBlockerMessages.join(" · ");

  useEffect(() => {
    console.log("[HackStamp] submit gate", {
      submitDisabled,
      submitBlockers,
      submitButtonLabel,
      panelStatus,
      isReceiptQueryPending,
      isWaitingForReceipt,
    });
  }, [
    isReceiptQueryPending,
    isWaitingForReceipt,
    panelStatus,
    submitBlockers,
    submitButtonLabel,
    submitDisabled,
  ]);

  function handleSubmitButtonPress() {
    if (submitDisabled) {
      console.log("[HackStamp] submit button clicked while disabled", {
        submitDisabled,
        submitBlockers,
        submitBlockerMessages,
        submitButtonLabel,
        panelStatus,
        hasPreview: Boolean(currentRecord),
        isConnected,
        address,
        chainId,
        isOnMonadTestnet,
        isSubmitting,
        isWaitingForReceipt,
      });
      return;
    }

    void handleSubmitOnchain();
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.page}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Text style={styles.title}>Hackathon Submission Proof</Text>
          <Text style={styles.subtitle}>
            Prove your project was completed before the deadline
          </Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Submission details</Text>
          <Text style={styles.panelText}>
            This build is prepared for the XAgent hackathon builder track.
          </Text>

          <View style={styles.detailBlock}>
            <Text style={styles.detailLabel}>Public repository</Text>
            <Pressable onPress={() => Linking.openURL(PUBLIC_REPO_URL)}>
              <Text style={styles.linkText}>{PUBLIC_REPO_URL}</Text>
            </Pressable>

            <Text style={styles.detailLabel}>OKX skill suite</Text>
            <Text style={styles.panelText}>{OKX_SKILL_NOTE}</Text>
          </View>
        </View>

        <View style={styles.form}>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={`GitHub repo URL, e.g. ${SAMPLE_REPO_URL}`}
            placeholderTextColor="#9CA3AF"
            style={styles.input}
            value={repoUrlInput}
            onChangeText={setRepoUrlInput}
          />

          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={`Commit hash, e.g. ${SAMPLE_COMMIT_HASH}`}
            placeholderTextColor="#9CA3AF"
            style={styles.input}
            value={commitHashInput}
            onChangeText={setCommitHashInput}
          />

          <Pressable
            style={({ pressed }) => [
              styles.button,
              pressed && styles.pressed,
            ]}
            onPress={handleGenerate}
          >
            <Text style={styles.buttonText}>Validate hash / Generate link</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.sampleButton,
              pressed && styles.pressed,
            ]}
            onPress={handleFillSample}
          >
            <Text style={styles.sampleButtonText}>Fill sample repo</Text>
          </Pressable>

          {!!error && <Text style={styles.errorText}>{error}</Text>}
          {!!notice && !error && <Text style={styles.noticeText}>{notice}</Text>}
        </View>

        {currentRecord ? (
          <View style={styles.resultGrid}>
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>On-chain submission</Text>
              {onchainLookup.status === "found" && onchainLookup.proof ? (
                <View style={styles.detailBlock}>
                  <Text style={styles.panelHint}>
                    This commit hash is already recorded on-chain. The submission record is shown below, and the submit button is hidden.
                  </Text>

                  <Text style={styles.detailLabel}>Submission time</Text>
                  <Text style={styles.panelText}>
                    {formatSubmittedAt(onchainLookup.proof.submittedAt)}
                  </Text>

                  <Text style={styles.detailLabel}>Submitter</Text>
                  <Text style={styles.hashText}>
                    {onchainLookup.proof.submitter}
                  </Text>

                  {/*
                  <Text style={styles.detailLabel}>On-chain repo</Text>
                  <Text style={styles.panelText}>
                    {onchainLookup.proof.repo || "Not provided"}
                  </Text>

                  <Text style={styles.detailLabel}>treeHash</Text>
                  <Text style={styles.hashText}>
                    {onchainLookup.proof.treeHash}
                  </Text>
                  */}

                  {!!txUrl ? (
                    <Pressable onPress={() => Linking.openURL(txUrl)}>
                      <Text style={styles.linkText}>{txUrl}</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : (
                <>
                <Text style={styles.panelHint}>
                    The contract address can be set via the query string or changed in code.
                  </Text>

                  <View style={styles.detailBlock}>
                    <Text style={styles.detailLabel}>Wallet status</Text>
                    <Text style={styles.statusText}>{statusLabel}</Text>

                    <View style={styles.inlineRow}>
                      {!isConnected ? (
                        <Pressable
                          style={({ pressed }) => [
                            styles.secondaryButton,
                            pressed && styles.pressed,
                          ]}
                          disabled={isConnecting}
                          onPress={handleConnectWallet}
                        >
                          <Text style={styles.secondaryButtonText}>
                            {isConnecting ? "Connecting..." : "Connect wallet"}
                          </Text>
                        </Pressable>
                      ) : (
                        <Pressable
                          style={({ pressed }) => [
                            styles.secondaryButton,
                            pressed && styles.pressed,
                          ]}
                          onPress={() => disconnect()}
                        >
                          <Text style={styles.secondaryButtonText}>Disconnect wallet</Text>
                        </Pressable>
                      )}

                      {!isOnMonadTestnet && isConnected ? (
                        <Pressable
                          style={({ pressed }) => [
                            styles.secondaryButton,
                            pressed && styles.pressed,
                          ]}
                          disabled={isSwitchingChain}
                          onPress={handleSwitchChain}
                        >
                          <Text style={styles.secondaryButtonText}>
                            {isSwitchingChain ? "Switching..." : "Switch to Monad Testnet"}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>

                    <Text style={styles.detailLabel}>Contract address</Text>
                    <Text style={styles.hashText}>{registryAddress}</Text>

                    <Text style={styles.detailLabel}>Submission payload</Text>
                    <Text style={styles.panelText}>
                      Only the commit hash is submitted. The repo URL is display-only and is not included in the on-chain parameters.
                    </Text>

                    <Pressable
                      style={({ pressed }) => [
                        styles.button,
                        submitDisabled && styles.buttonDisabled,
                        pressed && styles.pressed,
                      ]}
                      accessibilityState={{ disabled: submitDisabled }}
                      onPress={handleSubmitButtonPress}
                    >
                      <Text style={styles.buttonText}>
                        {isCheckingOnchain
                          ? "Checking..."
                          : submitButtonLabel}
                      </Text>
                    </Pressable>

                    {submitDisabled && submitBlockerSummary ? (
                      <Text style={styles.blockerText}>
                        Current submission blocked: {submitBlockerSummary}
                      </Text>
                    ) : null}

                    {!!txUrl && (
                      <Pressable onPress={() => Linking.openURL(txUrl)}>
                        <Text style={styles.linkText}>{txUrl}</Text>
                      </Pressable>
                    )}

                    <Text style={styles.detailLabel}>Transaction status</Text>
                    <Text style={styles.statusText}>{panelStatus}</Text>

                    {!!receipt && (
                      <Text style={styles.panelText}>
                        {receipt.status === "success"
                          ? "Transaction confirmed."
                          : "Transaction receipt indicates failure."}
                      </Text>
                    )}

                    {!!submittedHash && !receipt && (
                      <Text style={styles.panelText}>
                        Got the tx hash, now querying the on-chain receipt.
                      </Text>
                    )}

                    {!!writeContractError && !error && (
                      <Text style={styles.errorText}>
                        {writeContractError.message}
                      </Text>
                    )}
                    {!!switchChainError && !error && (
                      <Text style={styles.errorText}>
                        {switchChainError.message}
                      </Text>
                    )}
                    {!!connectError && !error && (
                      <Text style={styles.errorText}>{connectError.message}</Text>
                    )}
                    {!!receiptError && !error && (
                      <Text style={styles.errorText}>{receiptError.message}</Text>
                    )}
                  </View>
                </>
              )}
            </View>

            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Preview</Text>
              <Text style={styles.panelText}>
                {onchainLookup.status === "found" ? (
                  <>
                    The following GitHub URL{" "}
                    <Text style={styles.inlineStrong}>is</Text> proved
                    completed before the specific time.
                  </>
                ) : (
                  <>
                    The following GitHub URL{" "}
                    <Text style={styles.inlineStrong}>will be</Text> proved
                    completed now.
                  </>
                )}
              </Text>

              <View style={styles.detailBlock}>
                <Text style={styles.detailLabel}>GitHub URL with hash</Text>
                <Pressable onPress={() => Linking.openURL(currentRecord.treeUrl)}>
                  <Text style={styles.linkText}>{currentRecord.treeUrl}</Text>
                </Pressable>

                <Text style={styles.detailLabel}>git clone command</Text>
                <Text style={styles.codeBlock}>{currentRecord.cloneCommand}</Text>

                <Text style={styles.detailLabel}>ZIP download link</Text>
                <Pressable onPress={() => Linking.openURL(currentRecord.zipUrl)}>
                  <Text style={styles.linkText}>{currentRecord.zipUrl}</Text>
                </Pressable>

                {/* <Text style={styles.detailLabel}>Current commit hash</Text>
                <Text style={styles.hashText}>{currentRecord.commitHash}</Text> */}

                <Text style={styles.detailLabel}>On-chain check</Text>
                <Text style={styles.statusText}>
                  {isCheckingOnchain
                    ? "Checking..."
                    : onchainLookup.status === "found"
                      ? "On-chain"
                      : onchainLookup.status === "not_found"
                        ? "Not on-chain"
                        : onchainLookup.status === "error"
                          ? "Check failed"
                          : "Waiting for check"}
                </Text>
                {onchainLookup.status === "not_found" ? (
                  <Text style={styles.panelText}>
                    This hash has not been recorded in the contract yet.
                  </Text>
                ) : null}

                {onchainLookup.status === "found" ? (
                  <Text style={styles.panelText}>
                    This hash is already on-chain, and the full submission record will be shown on the right.
                  </Text>
                ) : null}

                {onchainLookup.status === "error" ? (
                  <Text style={styles.errorText}>{onchainLookup.message}</Text>
                ) : null}
              </View>

              <Text style={styles.panelHint}>
                Reminder: do not force push, resubmit after a revert, or rewrite history. If the hash changes, your previous proof will be invalid!
              </Text>
            </View>
          </View>
        ) : null}

        {!canUseInjectedWallet ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Current environment</Text>
            <Text style={styles.panelText}>
              Browser wallet connections are only available in the web version. If mobile support is added later, it should use a separate wallet integration.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  page: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 32,
    gap: 22,
    backgroundColor: "#FFFFFF",
  },
  hero: {
    width: "100%",
    maxWidth: 760,
    alignItems: "center",
    gap: 12,
  },
  title: {
    color: "#111827",
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: -0.8,
  },
  subtitle: {
    color: "#4B5563",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    maxWidth: 700,
  },
  form: {
    width: "100%",
    maxWidth: 760,
    gap: 12,
    alignItems: "stretch",
  },
  input: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    color: "#111827",
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
  },
  button: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  sampleButton: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: "#F9FAFB",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  sampleButtonText: {
    color: "#374151",
    fontSize: 15,
    fontWeight: "700",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  secondaryButton: {
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "700",
  },
  errorText: {
    color: "#B91C1C",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
  noticeText: {
    color: "#166534",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
  blockerText: {
    color: "#92400E",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
  resultGrid: {
    width: "100%",
    maxWidth: 760,
    gap: 14,
  },
  panel: {
    gap: 10,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 18,
  },
  panelTitle: {
    color: "#111827",
    fontSize: 20,
    fontWeight: "800",
  },
  panelText: {
    color: "#374151",
    fontSize: 14,
    lineHeight: 22,
  },
  inlineStrong: {
    color: "#111827",
    fontWeight: "700",
  },
  panelHint: {
    color: "#6B7280",
    fontSize: 13,
    lineHeight: 20,
  },
  detailBlock: {
    gap: 8,
    paddingTop: 8,
    paddingBottom: 4,
  },
  detailLabel: {
    color: "#6B7280",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginTop: 4,
  },
  linkText: {
    color: "#1D4ED8",
    fontSize: 13,
    lineHeight: 19,
    textDecorationLine: "underline",
  },
  codeBlock: {
    color: "#111827",
    fontSize: 12,
    lineHeight: 18,
    fontFamily: "monospace",
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
  },
  hashText: {
    color: "#111827",
    fontSize: 13,
    lineHeight: 20,
    fontFamily: "monospace",
  },
  statusText: {
    color: "#166534",
    fontSize: 14,
    fontWeight: "700",
  },
  inlineRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "center",
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
});
