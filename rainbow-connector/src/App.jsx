import '@rainbow-me/rainbowkit/styles.css';
import {
  connectorsForWallets,
  RainbowKitProvider,
  darkTheme
} from '@rainbow-me/rainbowkit';
import { 
  metaMaskWallet, 
  okxWallet, 
  coinbaseWallet, 
  rabbyWallet, 
  walletConnectWallet 
} from '@rainbow-me/rainbowkit/wallets';
import { WagmiProvider, useAccount, useDisconnect, useSendTransaction, useWriteContract, useSwitchChain, useChainId, useConnect, createConfig, http } from 'wagmi';
import { parseEther } from 'viem';
import { base } from 'wagmi/chains';
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { useEffect } from 'react';

const connectors = connectorsForWallets(
  [
    {
      groupName: 'Popular',
      wallets: [
        metaMaskWallet,
        okxWallet,
        coinbaseWallet,
        rabbyWallet,
        walletConnectWallet
      ],
    },
  ],
  {
    appName: 'Pandus Base Passport',
    projectId: '2f5f11cc5fa23d4f13ee190a4dfb7c89',
  }
);

const config = createConfig({
  connectors,
  chains: [base],
  transports: {
    [base.id]: http(),
  },
  ssr: false,
});

const queryClient = new QueryClient();

function ConnectionWatcher() {
  const { address, isConnected, connector } = useAccount();
  const { disconnect } = useDisconnect();
  const { sendTransaction } = useSendTransaction();
  const { writeContractAsync } = useWriteContract();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { connectAsync, connectors } = useConnect();

  useEffect(() => {
    if (window.handleWalletConnectChange) {
      window.handleWalletConnectChange({
        address: address || "",
        isConnected: !!isConnected,
        providerName: connector?.name || ""
      });
    }
  }, [address, isConnected, connector]);

  useEffect(() => {
    window.wagmiDisconnect = () => {
      disconnect();
    };

    window.wagmiConnect = async (walletId) => {
      console.log("[Wagmi Connect] Attempting to connect to wallet:", walletId);
      let targetConnector = null;
      
      if (walletId === 'metamask') {
        targetConnector = connectors.find(c => c.id === 'metaMaskSDK' || c.id === 'injected' && c.name.toLowerCase().includes('metamask'));
        if (!targetConnector) {
          targetConnector = connectors.find(c => c.id === 'injected');
        }
      } else if (walletId === 'okx') {
        targetConnector = connectors.find(c => c.id === 'okx' || c.name.toLowerCase().includes('okx'));
      } else if (walletId === 'base') {
        targetConnector = connectors.find(c => c.id === 'coinbaseWalletSDK' || c.id === 'coinbaseWallet' || c.name.toLowerCase().includes('coinbase'));
      } else if (walletId === 'rabby') {
        targetConnector = connectors.find(c => c.id === 'rabby' || c.name.toLowerCase().includes('rabby'));
      } else if (walletId === 'walletconnect') {
        targetConnector = connectors.find(c => c.id === 'walletConnect');
      }
      
      if (!targetConnector) {
        console.error("[Wagmi Connect] No connector found for:", walletId);
        if (window.showToast) {
          window.showToast(`❌ Connector for ${walletId} not found in this browser.`, "error");
        }
        if (window.handleWagmiError) {
          window.handleWagmiError(new Error(`Connector ${walletId} not found`));
        }
        return;
      }
      
      try {
        console.log("[Wagmi Connect] Connecting using connector:", targetConnector.name, targetConnector.id);
        if (window.showToast) {
          window.showToast(`⌛ Connecting to ${targetConnector.name}...`, "purple");
        }
        const result = await connectAsync({ connector: targetConnector, chainId: base.id });
        console.log("[Wagmi Connect] Connection successful:", result);
        return result;
      } catch (err) {
        console.error("[Wagmi Connect] Connection failed:", err);
        if (window.handleWagmiError) {
          window.handleWagmiError(err);
        }
        throw err;
      }
    };

    window.wagmiSendTransaction = async (actionType, amountStr, extraParam = "") => {
        if (chainId !== base.id) {
            console.log(`[Wagmi Web3] Wrong network: ${chainId}. Switching to Base (${base.id})...`);
            try {
                if (window.showToast) {
                    window.showToast("⌛ Switching network to Base...", "purple");
                }
                await switchChainAsync({ chainId: base.id });
            } catch (switchErr) {
                console.error("[Wagmi Web3] Failed to switch to Base network:", switchErr);
                if (window.showToast) {
                    window.showToast("❌ Please switch your wallet to the Base Network.", "error");
                }
                throw switchErr;
            }
        }

        const contractAddress = window.baseContractAddress || "";
        const contractABI = [
          {
            "inputs": [{"internalType": "string", "name": "tokenURI", "type": "string"}],
            "name": "mintPassport",
            "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
            "stateMutability": "payable",
            "type": "function"
          },
          {
            "inputs": [],
            "name": "payCheckIn",
            "outputs": [],
            "stateMutability": "payable",
            "type": "function"
          },
          {
            "inputs": [{"internalType": "string", "name": "gameName", "type": "string"}],
            "name": "payGameRoll",
            "outputs": [],
            "stateMutability": "payable",
            "type": "function"
          },
          {
            "inputs": [{"internalType": "string", "name": "serviceName", "type": "string"}],
            "name": "payVerification",
            "outputs": [],
            "stateMutability": "payable",
            "type": "function"
          }
        ];

        if (contractAddress && contractAddress.startsWith("0x")) {
            console.log(`[Wagmi Web3] Calling contract ${contractAddress} for ${actionType}`);
            try {
                let txHash;
                const valueInWei = parseEther(amountStr);
                
                if (actionType === "mint") {
                    txHash = await writeContractAsync({
                        address: contractAddress,
                        abi: contractABI,
                        functionName: 'mintPassport',
                        args: [extraParam || "https://pandus.app/metadata/passport"],
                        value: valueInWei
                    });
                } else if (actionType === "checkin") {
                    txHash = await writeContractAsync({
                        address: contractAddress,
                        abi: contractABI,
                        functionName: 'payCheckIn',
                        args: [],
                        value: valueInWei
                    });
                } else if (actionType === "game") {
                    txHash = await writeContractAsync({
                        address: contractAddress,
                        abi: contractABI,
                        functionName: 'payGameRoll',
                        args: [extraParam || "dice"],
                        value: valueInWei
                    });
                } else {
                    txHash = await writeContractAsync({
                        address: contractAddress,
                        abi: contractABI,
                        functionName: 'payVerification',
                        args: [actionType],
                        value: valueInWei
                    });
                }
                return txHash;
            } catch (err) {
                console.error("[Wagmi Web3] Contract call failed:", err);
                throw err;
            }
        } else {
            console.log("[Wagmi Web3] No contract address configured. Falling back to direct transfer.");
            return new Promise((resolve, reject) => {
                sendTransaction({
                    to: window.baseReceiverAddress || '0x0000000000000000000000000000000000000000',
                    value: parseEther(amountStr),
                }, {
                    onSuccess(data) {
                        resolve(data);
                    },
                    onError(err) {
                        reject(err);
                    }
                });
            });
        }
    };
  }, [disconnect, sendTransaction, writeContractAsync]);

  return null;
}

export default function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme({
          accentColor: '#0052FF',
          accentColorForeground: 'white',
          borderRadius: 'medium',
          overlayBlur: 'small',
        })}>
          <ConnectionWatcher />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
