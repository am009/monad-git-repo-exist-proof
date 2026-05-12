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
import { SafeAreaView } from "react-native-safe-area-context";
import { monadTestnet } from "viem/chains";
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

function normalizeGitHubRepoUrl(input: string): RepositoryParts {
  const trimmed = input.trim().replace(/\.git$/i, "");

  if (!trimmed) {
    throw new Error("请输入 GitHub 仓库 URL");
  }

  const normalized = trimmed.match(/^https?:\/\//i)
    ? trimmed
    : `https://${trimmed.replace(/^github\.com\//i, "github.com/")}`;

  const url = new URL(normalized);
  const host = url.hostname.toLowerCase();

  if (host !== "github.com" && host !== "www.github.com") {
    throw new Error("仓库 URL 必须是 GitHub URL");
  }

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length !== 2) {
    throw new Error("请填写 GitHub 仓库主页 URL，不要填写 tree/blob 页面");
  }

  const owner = parts[0];
  const repoName = parts[1];
  const repoUrl = `https://github.com/${owner}/${repoName}`;

  return { owner, repoName, repoUrl };
}

function normalizeCommitHash(input: string): string {
  const trimmed = input.trim().toLowerCase().replace(/^0x/, "");

  if (!/^[0-9a-f]{40}$/.test(trimmed)) {
    throw new Error("commit hash 必须是 40 位 Git SHA1");
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

function shortenHash(hash: string, prefixLength = 8, suffixLength = 6) {
  if (hash.length <= prefixLength + suffixLength) {
    return hash;
  }

  return `${hash.slice(0, prefixLength)}…${hash.slice(-suffixLength)}`;
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
  return new Date(Number(submittedAt) * 1000).toLocaleString("zh-CN", {
    hour12: false,
  });
}

export default function Index() {
  const [repoUrlInput, setRepoUrlInput] = useState("");
  const [commitHashInput, setCommitHashInput] = useState("");
  const [currentRecord, setCurrentRecord] = useState<SubmissionRecord | null>(
    null,
  );
  const [submittedHash, setSubmittedHash] = useState<`0x${string}` | null>(
    null,
  );
  const [isCheckingOnchain, setIsCheckingOnchain] = useState(false);
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
        repoError instanceof Error ? repoError.message : "GitHub URL 无效",
      );
      return;
    }

    try {
      commitHash = normalizeCommitHash(commitHashInput);
    } catch (hashError) {
      console.log("[HackStamp] hash validation failed", hashError);
      setError(
        hashError instanceof Error ? hashError.message : "commit hash 无效",
      );
      return;
    }

    const nextRecord = buildSubmissionRecord(repo, commitHash);
    console.log("[HackStamp] preview built", nextRecord);
    setCurrentRecord(nextRecord);

    if (!publicClient) {
      setError("当前环境没有可用的 RPC 客户端，无法检查链上记录。");
      return;
    }

    const normalizedCommitHash = `0x${commitHash}` as const;
    setIsCheckingOnchain(true);
    setOnchainLookup({
      status: "checking",
      proof: null,
      message: "正在检查链上是否已经存在这个 commit hash。",
    });
    setNotice("已生成展示链接，正在检查链上记录。");

    console.log("[HackStamp] onchain lookup started", {
      commitHash: normalizedCommitHash,
      repoSlug: nextRecord.repoSlug,
    });

    try {
      const exists = await publicClient.readContract({
        abi: HACKSTAMP_REGISTRY_ABI,
        address: HACKSTAMP_REGISTRY_ADDRESS,
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
          message: "这个 hash 还没有上链。",
        });
        setNotice("已生成展示链接，这个 hash 目前还没有上链。");
        return;
      }

      const proof = await publicClient.readContract({
        abi: HACKSTAMP_REGISTRY_ABI,
        address: HACKSTAMP_REGISTRY_ADDRESS,
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
        message: "这个 hash 已经上链。",
      });
      setNotice("已生成展示链接，这个 hash 已经在链上登记。");
    } catch (lookupError) {
      console.log("[HackStamp] onchain lookup failed", lookupError);
      setOnchainLookup({
        status: "error",
        proof: null,
        message:
          lookupError instanceof Error
            ? lookupError.message
            : "链上查询失败",
      });
      setNotice("已生成展示链接，但链上检查失败。");
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
      setError("当前版本只支持 web 浏览器钱包。");
      return;
    }

    if (!connectConnector) {
      setError("未找到可用的钱包扩展。请安装 MetaMask 或类似浏览器钱包。");
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
      setError("请先生成 commit hash 预览。");
      return;
    }

    if (!isConnected || !address) {
      setError("请先连接钱包。");
      return;
    }

    if (!isOnMonadTestnet) {
      setError("请先切换到 Monad Testnet。");
      return;
    }

    try {
      // The deployed registry still expects tree/repo fields; commit hash is the only meaningful payload here.
      console.log("[HackStamp] sending contract write", {
        address: HACKSTAMP_REGISTRY_ADDRESS,
        commitHash: currentRecord.commitHash,
        repo: currentRecord.repoSlug,
      });
      const txHash = await writeContractAsync({
        abi: HACKSTAMP_REGISTRY_ABI,
        address: HACKSTAMP_REGISTRY_ADDRESS,
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
      setNotice("交易已发送，等待链上确认。");
    } catch (submitError) {
      console.log("[HackStamp] submit failed", submitError);
      setError(
        submitError instanceof Error ? submitError.message : "提交交易失败",
      );
    }
  }

  const statusLabel = isConnected
    ? `${shortenAddress(address ?? "")} · ${isOnMonadTestnet ? "Monad Testnet" : "错误网络"}`
    : "未连接钱包";

  const panelStatus = receipt
    ? receipt.status === "success"
      ? "已确认"
      : "交易失败"
    : submittedHash
      ? isWaitingForReceipt
        ? "等待确认"
        : "已发送"
      : "未提交";

  const submitButtonLabel = isSubmitting
    ? "等待钱包确认..."
    : submittedHash && isWaitingForReceipt
      ? "已发送，等待确认..."
      : receipt?.status === "success"
        ? "已确认"
        : "提交上链";

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
        return "还没有生成 commit 预览";
      case "wallet_disconnected":
        return "钱包未连接";
      case "wrong_chain":
        return "当前网络不是 Monad Testnet";
      case "wallet_confirming":
        return "钱包正在确认交易";
      case "waiting_receipt":
        return "交易已发送，正在等待链上回执";
      case "already_confirmed":
        return "该提交已经确认，如需重新上链请修改 commit hash";
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
          <Text style={styles.title}>黑客松项目提交证明</Text>
          <Text style={styles.subtitle}>
            证明你在截止时间前完成了项目
          </Text>
        </View>

        <View style={styles.form}>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="GitHub repo URL，例如 https://github.com/NomicFoundation/solx"
            placeholderTextColor="#9CA3AF"
            style={styles.input}
            value={repoUrlInput}
            onChangeText={setRepoUrlInput}
          />

          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="commit hash，例如 f0f73f9e8bda8aaf6ead699672ac41167c42c490"
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
            <Text style={styles.buttonText}>验证 hash / 生成链接</Text>
          </Pressable>

          {!!error && <Text style={styles.errorText}>{error}</Text>}
          {!!notice && !error && <Text style={styles.noticeText}>{notice}</Text>}
        </View>

        {currentRecord ? (
          <View style={styles.resultGrid}>
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>展示结果</Text>
              <Text style={styles.panelText}>
                GitHub URL 只用于展示。真正后续进入合约的锚点，只应该是 commit hash。
              </Text>

              <View style={styles.detailBlock}>
                <Text style={styles.detailLabel}>带 hash 的 GitHub URL</Text>
                <Pressable onPress={() => Linking.openURL(currentRecord.treeUrl)}>
                  <Text style={styles.linkText}>{currentRecord.treeUrl}</Text>
                </Pressable>

                <Text style={styles.detailLabel}>git clone 命令</Text>
                <Text style={styles.codeBlock}>{currentRecord.cloneCommand}</Text>

                <Text style={styles.detailLabel}>zip 下载链接</Text>
                <Pressable onPress={() => Linking.openURL(currentRecord.zipUrl)}>
                  <Text style={styles.linkText}>{currentRecord.zipUrl}</Text>
                </Pressable>

                <Text style={styles.detailLabel}>当前 commit hash</Text>
                <Text style={styles.hashText}>
                  {shortenHash(currentRecord.commitHash)}
                </Text>

                <Text style={styles.detailLabel}>链上检查</Text>
                <Text style={styles.statusText}>
                  {isCheckingOnchain
                    ? "正在检查..."
                    : onchainLookup.status === "found"
                      ? "已上链"
                      : onchainLookup.status === "not_found"
                        ? "未上链"
                        : onchainLookup.status === "error"
                          ? "检查失败"
                          : "等待检查"}
                </Text>
                {onchainLookup.status === "not_found" ? (
                  <Text style={styles.panelText}>
                    这个 hash 还没有在合约里登记。
                  </Text>
                ) : null}

                {onchainLookup.status === "found" ? (
                  <Text style={styles.panelText}>
                    这个 hash 已经上链，右侧会直接展示完整提交记录。
                  </Text>
                ) : null}

                {onchainLookup.status === "error" ? (
                  <Text style={styles.errorText}>{onchainLookup.message}</Text>
                ) : null}
              </View>

              <Text style={styles.panelHint}>
                提醒：不要 force push、revert 后重提或 rewrite history。hash 一变，就应该视为新版本。
              </Text>
            </View>

            <View style={styles.panel}>
              <Text style={styles.panelTitle}>链上提交</Text>
              {onchainLookup.status === "found" && onchainLookup.proof ? (
                <View style={styles.detailBlock}>
                  <Text style={styles.panelHint}>
                    当前 commit hash 已经在链上登记。下面直接展示提交记录，不再提供提交按钮。
                  </Text>

                  <Text style={styles.detailLabel}>提交时间</Text>
                  <Text style={styles.panelText}>
                    {formatSubmittedAt(onchainLookup.proof.submittedAt)}
                  </Text>

                  <Text style={styles.detailLabel}>提交者</Text>
                  <Text style={styles.hashText}>
                    {onchainLookup.proof.submitter}
                  </Text>

                  <Text style={styles.detailLabel}>链上 repo</Text>
                  <Text style={styles.panelText}>
                    {onchainLookup.proof.repo || "未填写"}
                  </Text>

                  <Text style={styles.detailLabel}>treeHash</Text>
                  <Text style={styles.hashText}>
                    {onchainLookup.proof.treeHash}
                  </Text>

                  {!!txUrl ? (
                    <Pressable onPress={() => Linking.openURL(txUrl)}>
                      <Text style={styles.linkText}>{txUrl}</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : (
                <>
                  <Text style={styles.panelHint}>
                    当前合约地址已固定为 Monad Testnet 上的 registry。
                  </Text>

                  <View style={styles.detailBlock}>
                    <Text style={styles.detailLabel}>钱包状态</Text>
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
                            {isConnecting ? "连接中..." : "连接钱包"}
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
                          <Text style={styles.secondaryButtonText}>断开钱包</Text>
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
                            {isSwitchingChain ? "切换中..." : "切到 Monad Testnet"}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>

                    <Text style={styles.detailLabel}>合约地址</Text>
                    <Text style={styles.hashText}>{HACKSTAMP_REGISTRY_ADDRESS}</Text>

                    <Text style={styles.detailLabel}>提交内容</Text>
                    <Text style={styles.panelText}>
                      只提交 commit hash。repo URL 只用于展示，不进入链上参数。
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
                          ? "检查中..."
                          : submitButtonLabel}
                      </Text>
                    </Pressable>

                    {submitDisabled && submitBlockerSummary ? (
                      <Text style={styles.blockerText}>
                        当前不可提交：{submitBlockerSummary}
                      </Text>
                    ) : null}

                    {!!txUrl && (
                      <Pressable onPress={() => Linking.openURL(txUrl)}>
                        <Text style={styles.linkText}>{txUrl}</Text>
                      </Pressable>
                    )}

                    <Text style={styles.detailLabel}>交易状态</Text>
                    <Text style={styles.statusText}>{panelStatus}</Text>

                    {!!receipt && (
                      <Text style={styles.panelText}>
                        {receipt.status === "success"
                          ? "交易已确认。"
                          : "交易回执显示失败。"}
                      </Text>
                    )}

                    {!!submittedHash && !receipt && (
                      <Text style={styles.panelText}>
                        已拿到 tx hash，正在查询链上回执。
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
          </View>
        ) : null}

        {!canUseInjectedWallet ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>当前环境</Text>
            <Text style={styles.panelText}>
              浏览器钱包连接只在 web 版本可用。移动端如果要继续做，之后再单独接钱包方案。
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
