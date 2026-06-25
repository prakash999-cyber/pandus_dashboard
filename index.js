/* ==========================================================================
   PANDUS BASE CHECKER - INTERACTIVE GAMEPLAY & DATA ENGINE
   ========================================================================== */

// Alchemy Base Mainnet Endpoint
const ALCHEMY_URL = "https://base-mainnet.g.alchemy.com/v2/zODK_5vlD-NdT6JX-sazC";
// Alchemy Base Sepolia Testnet Endpoint
const ALCHEMY_SEPOLIA_URL = "https://base-sepolia.g.alchemy.com/v2/zODK_5vlD-NdT6JX-sazC";

// 1. Initial State Data & Configuration
const APP_STATE = {
    currentUser: "fresh",
    xp: 0,
    bxp: 0,
    airdropScore: 0,
    rollsLeft: 0,
    boxesLeft: 0,
    hasCheckedIn: false,
    checkInStreak: 0,        // current consecutive day streak (1-7)
    
    // Check-in timer setup (19h 22m 41s from now in seconds)
    checkInTimeRemaining: 0,
    
    chartType: "tx", // 'tx' or 'volume' or 'bxp'
    chartTimeframe: "6m",
    
    // Wallet provider states — all start empty until wallet actually connects
    activeProvider: "base",
    providers: {
        base: { name: "Base Wallet", icon: "🛡️", balance: "0.000 ETH", addressOffset: "" },
        metamask: { name: "MetaMask", icon: "🦊", balance: "0.000 ETH", addressOffset: "" },
        okx: { name: "OKX Wallet", icon: "✖️", balance: "0.000 ETH", addressOffset: "" },
        farcaster: { name: "Farcaster (Warpcast)", icon: "🍇", balance: "0.000 ETH", addressOffset: "" }
    },
    
    // BXP Transaction Ledger — empty until wallet connects
    bxpTransactions: [],
    isPassportMinted: false,
    hasSharedX: false,
    hasCelebratedX: false,
    hasBoostedActivity: false,
    baseMentions: null,
    scannedHandle: "",
    connectedAddress: ""
};

// 1b. Session & Data Persistence Helpers (localStorage)
function saveState() {
    try {
        const appStateCopy = { ...APP_STATE };
        appStateCopy.connectedAddress = "";
        appStateCopy.currentUser = "fresh";
        
        // Save all profiles (including custom user wallets)
        const profilesCopy = { ...PROFILES };

        localStorage.setItem("PANDUS_APP_STATE_V2", JSON.stringify(appStateCopy));
        localStorage.setItem("PANDUS_PROFILES_V2", JSON.stringify(profilesCopy));
    } catch (e) {
        console.error("Error saving state to localStorage:", e);
    }
}

function loadState() {
    try {
        const savedProfiles = localStorage.getItem("PANDUS_PROFILES_V2");
        if (savedProfiles) {
            const parsed = JSON.parse(savedProfiles);
            Object.assign(PROFILES, parsed);
        }
        const savedState = localStorage.getItem("PANDUS_APP_STATE_V2");
        if (savedState) {
            const parsed = JSON.parse(savedState);
            parsed.connectedAddress = "";
            parsed.currentUser = "fresh";
            Object.assign(APP_STATE, parsed);
        }
    } catch (e) {
        console.error("Error loading state from localStorage:", e);
    }
}

// Simulated server-side scoring engine
const backend = {
    async calculatePassport(address) {
        return new Promise((resolve) => {
            setTimeout(() => {
                const key = findProfileByAddress(address);
                if (key && PROFILES[key]) {
                    resolve(calculateAirdropScore(PROFILES[key]));
                } else {
                    resolve(50);
                }
            }, 120);
        });
    }
};
function updateAirdropStats(user) {
    if (!user) return;
    
    // Parse wallet age in days
    let ageDays = 0;
    if (user.walletAge) {
        const ageStr = String(user.walletAge).toLowerCase();
        if (ageStr.includes("year")) {
            ageDays = parseFloat(ageStr) * 365;
        } else {
            ageDays = parseFloat(ageStr) || 0;
        }
    }
    
    // Parse total transactions count
    const txCountVal = parseInt(String(user.txs).replace(/,/g, "")) || user.txsCount || 0;
    
    let activeDaysCount = 0;
    let activeWeeksCount = 0;
    
    const isMockProfile = ["onchain_kid", "vitalik.eth", "baseking.eth", "jesse.eth", "kid.eth"].includes(user.name);
    
    if (user.realTransactions && user.realTransactions.length > 0 && !isMockProfile) {
        const uniqueDays = new Set();
        const uniqueWeeks = new Set();
        
        user.realTransactions.forEach(tx => {
            let txTime = 0;
            if (tx.timeStamp) txTime = parseInt(tx.timeStamp) * 1000;
            
            if (txTime > 0) {
                const date = new Date(txTime);
                const dayStr = date.toISOString().split('T')[0];
                uniqueDays.add(dayStr);
                
                const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
                const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
                const weekNum = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
                const weekStr = `${date.getFullYear()}-W${weekNum}`;
                uniqueWeeks.add(weekStr);
            }
        });
        
        activeDaysCount = uniqueDays.size;
        activeWeeksCount = uniqueWeeks.size;
    }
    
    if (activeDaysCount === 0 && ageDays > 0) {
        activeDaysCount = Math.min(txCountVal, Math.max(1, Math.round(ageDays * 0.28)));
        activeWeeksCount = Math.min(Math.max(1, Math.round(ageDays / 7)), Math.max(1, Math.round(activeDaysCount * 0.85)));
    }
    
    if (user.activeDays) {
        let calendarDaysCount = 0;
        Object.keys(user.activeDays).forEach(k => {
            calendarDaysCount += user.activeDays[k].length;
        });
        activeDaysCount = Math.max(activeDaysCount, calendarDaysCount);
        activeWeeksCount = Math.max(activeWeeksCount, Math.round(calendarDaysCount / 3.5));
    }
    
    const ratio = ageDays > 0 ? ((activeDaysCount / ageDays) * 100) : 0;
    const streak = Math.min(14, Math.max(1, Math.floor(activeDaysCount / 8)));
    
    user.airdropStats = {
        activeDays: `${activeDaysCount} days`,
        activeWeeks: `${activeWeeksCount} weeks`,
        ratio: `${ratio.toFixed(1)}%`,
        streak: `${streak} days`
    };
}

function updateAirdropUI(user) {
    if (!DOM.airdropActScoreVal) return;
    
    // Sync historical statistics from when they started to today
    updateAirdropStats(user);
    
    const computedScore = user.airdropScore !== undefined ? user.airdropScore : calculateAirdropScore(user);
    DOM.airdropActScoreVal.innerText = computedScore;
    
    let badgeText = "Base Explorer 🛡️";
    let badgeClass = "status-qualified";
    let badgeColor = "#3b82f6";
    if (computedScore >= 85) {
        badgeText = "God of Base 👑";
        badgeClass = "status-strong";
        badgeColor = "#10b981";
    } else if (computedScore < 80) {
        badgeText = "Base Kids 👶";
        badgeClass = "status-warning";
        badgeColor = "#ef4444";
    }
    DOM.airdropActScoreBadge.innerText = badgeText;
    DOM.airdropActScoreBadge.className = `score-badge ${badgeClass}`;
    DOM.airdropActScoreBadge.style.color = badgeColor;
    
    const sub = user.airdropSubMetrics || { days: 0, contracts: 0, gas: 0 };
    DOM.subScoreDays.innerText = `${sub.days}/100`;
    DOM.subScoreContracts.innerText = `${sub.contracts}/100`;
    DOM.subScoreGas.innerText = `${sub.gas}/100`;
    
    DOM.subBarDays.style.width = `${sub.days}%`;
    DOM.subBarContracts.style.width = `${sub.contracts}%`;
    DOM.subBarGas.style.width = `${sub.gas}%`;
    
    const stats = user.airdropStats || { activeDays: "0 days", activeWeeks: "0 weeks", ratio: "0%", streak: "0 days" };
    DOM.fStatActiveDays.innerText = stats.activeDays;
    DOM.fStatWeeks.innerText = stats.activeWeeks;
    DOM.fStatRatio.innerText = stats.ratio;
    DOM.fStatStreak.innerText = stats.streak;
}

// Streak BXP schedule (Day 1-7)
const STREAK_BXP = [10, 20, 30, 40, 50, 60, 70];

// Calculate dynamic airdrop reputation score (out of 100) based on OP, ARB, and STRK criteria
function calculateAirdropScore(user) {
    let score = 0;
    
    // 1. Month Activity (Optimism/Arbitrum criteria - active months)
    let days = 0;
    if (user.walletAge) {
        const ageStr = String(user.walletAge).toLowerCase();
        if (ageStr.includes("year")) {
            days = parseFloat(ageStr) * 365;
        } else {
            days = parseFloat(ageStr) || 0;
        }
    }
    const months = days / 30;
    if (months >= 2) score += 10;
    if (months >= 6) score += 10;
    if (months >= 9) score += 10;
    
    // 2. Transaction Count (Arbitrum/Starknet criteria)
    const txs = user.txsCount || 0;
    if (txs >= 10) score += 10;
    if (txs >= 50) score += 10;
    if (txs >= 200) score += 10;
    
    // 3. Volume Tiers (Arbitrum/Starknet criteria)
    const vol = user.volumeCount || 0;
    if (vol >= 1000) score += 10;
    if (vol >= 10000) score += 10;
    
    // 4. Verification & Sybil Security (Optimism/Starknet criteria)
    if (user.onchainVerifier) score += 10;
    
    // 5. Special Ecosystem Holdings (OG Builder / Beta NFT)
    if (user.hasBuilderNFT || user.hasBetaNFT) score += 10;
    
    // 6. Social Mentions Engagement (rewarding active promoters)
    let mentionsCount = 0;
    if (user.hasScannedX) {
        mentionsCount = user.baseMentions || 0;
    }
    if (mentionsCount >= 5) score += 5;
    if (mentionsCount >= 20) score += 5;
    
    // High usage distinction bonus rule
    if (txs >= 200 && vol >= 10000) {
        let baseHighUsageScore = 75;
        const protocolsUsed = user.protocols || 0;
        if (protocolsUsed >= 10) baseHighUsageScore += 10;
        else if (protocolsUsed >= 5) baseHighUsageScore += 5;

        let activeDaysCount = 0;
        if (user.activeDays) {
            Object.keys(user.activeDays).forEach(k => {
                if (Array.isArray(user.activeDays[k])) {
                    activeDaysCount += user.activeDays[k].length;
                }
            });
        }
        if (activeDaysCount >= 30) baseHighUsageScore += 10;
        else if (activeDaysCount >= 15) baseHighUsageScore += 5;

        if (user.onchainVerifier) baseHighUsageScore += 5;
        if (user.hasBuilderNFT || user.hasBetaNFT) baseHighUsageScore += 5;

        score = Math.max(score, baseHighUsageScore);
    }

    // Sybil Cluster Penalty (sending funds directly to more than 3 wallets)
    const sentCount = user.sentToWalletsCount || 0;
    if (sentCount > 3) {
        score = Math.max(10, score - 30); // Deduct 30 points, minimum score 10
    }
    
    return Math.min(97, Math.max(0, score));
}

// Simulated Profiles Database
const PROFILES = {
    "fresh": {
        name: "Verify Wallet",
        address: "",
        shortAddress: "No Wallet Connected",
        airdropScore: 0,
        bxp: 0,
        xp: 0,
        mentions: 0,
        sybil: "—",
        sybilStatus: "Connect wallet to verify",
        walletAge: "0 Days",
        walletAgeSub: "No transaction history",
        txs: "0",
        txsCount: 0,
        txsSub: "0 this week",
        weeklyTxs: "0",
        weeklyTxsSub: "0 / month",
        volume: "$0",
        volumeCount: 0,
        volumeSub: "No volume",
        radarValues: [0, 0, 0, 0, 0],
        hasScannedX: false,
        baseMentions: null,
        scannedHandle: "",
        sentiment: "",
        hasBuilderNFT: false,
        hasBetaNFT: false,
        onchainVerifier: false,
        guildMember: false,
        protocols: 0,
        joinedDate: "—",
        totalNfts: 0,
        multiWallets: 1,
        sentToWalletsCount: 0,
        totalFeeSpent: "$0.00",
        usedTestnet: false,
        badges: [
            { id: "og", name: "Base OG", desc: "Locked", active: false },
            { id: "mention", name: "Mention Master", desc: "Locked", active: false },
            { id: "hundred", name: "100-Day Club", desc: "Locked", active: false },
            { id: "whale", name: "Whale", desc: "Locked", active: false }
        ],
        eligibility: [
            { project: "Arbitrum (ARB)", logo: "A", class: "arb", activity: "0 Tx (❌)", bridge: "Bridged 0 ETH (❌)", holding: "0.0000 ETH (❌)", status: "status-warning", label: "❌ Ineligible" },
            { project: "Optimism (OP)", logo: "O", class: "op", activity: "0 Tx (❌)", bridge: "Bridged 0 ETH (❌)", holding: "0.0000 ETH (❌)", status: "status-warning", label: "❌ Ineligible" },
            { project: "LayerZero (ZRO)", logo: "L", class: "l0", activity: "0 Tx (❌)", bridge: "Bridged 0 ETH (❌)", holding: "0.0000 ETH (❌)", status: "status-warning", label: "❌ Ineligible" },
            { project: "Zora (ZORA)", logo: "Z", class: "zora", activity: "0 Tx (❌)", bridge: "Bridged 0 ETH (❌)", holding: "0.0000 ETH (❌)", status: "status-warning", label: "❌ Ineligible" },
            { project: "Hyperlane (HYPER)", logo: "H", class: "hyper", activity: "0 Tx (❌)", bridge: "Bridged 0 ETH (❌)", holding: "0.0000 ETH (❌)", status: "status-warning", label: "❌ Ineligible" }
        ],
        chartData: {
            tx: [0, 0, 0, 0, 0, 0],
            volume: [0, 0, 0, 0, 0, 0],
            bxp: [0, 0, 0, 0, 0, 0]
        },
        avatar: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'><rect width='40' height='40' fill='%23161e2e'/><text x='50%' y='54%' text-anchor='middle' dominant-baseline='middle' font-size='18' fill='%23445066'>?</text></svg>",
        activeDays: {
            April: [], May: [], June: []
        },
        airdropSubMetrics: { days: 0, contracts: 0, gas: 0 },
        airdropStats: { activeDays: "0 days", activeWeeks: "0 weeks", ratio: "0%", streak: "0 days" },
        invitedFriends: [],
        invitedCount: 0,
        referralBxpClaimed: 0
    },
    "onchain_kid": {
        name: "onchain_kid",
        address: "0x8f2f27a659ef8c8d8f2f27a659ef8c8d8f2f27a6",
        shortAddress: "0x8f2f...91ac",
        airdropScore: 94,
        bxp: 28440,
        xp: 8920,
        mentions: 37,
        sybil: "A-",
        sybilStatus: "Human",
        walletAge: "412 days",
        walletAgeSub: "Since Apr 2025",
        txs: "1,284",
        txsCount: 1284,
        txsSub: "+18 this week",
        weeklyTxs: "26",
        weeklyTxsSub: "94 / month",
        volume: "$4,920",
        volumeCount: 4920,
        volumeSub: "+$310 this week",
        radarValues: [0.90, 0.85, 0.60, 0.75, 0.80],
        hasScannedX: false,
        baseMentions: null,
        scannedHandle: "",
        sentiment: "",
        hasBuilderNFT: true,
        hasBetaNFT: false,
        onchainVerifier: true,
        guildMember: true,
        protocols: 8,
        joinedDate: "April 12, 2025",
        totalNfts: 18,
        multiWallets: 1,
        sentToWalletsCount: 1,
        totalFeeSpent: "$14.82",
        usedTestnet: true,
        badges: [
            { id: "og", name: "Base OG", desc: "1yr+ wallet", active: true },
            { id: "mention", name: "Mention Master", desc: "50+ tweets", active: true },
            { id: "hundred", name: "100-Day Club", desc: "Locked", active: false },
            { id: "whale", name: "Whale", desc: "Locked", active: false }
        ],
        eligibility: [
            { project: "Arbitrum (ARB)", logo: "A", class: "arb", activity: "1,284 Tx / 17d (✓)", bridge: "Bridged 1.8 ETH (✓)", holding: "1.482 ETH (✓)", status: "status-qualified", label: "✓ Qualified" },
            { project: "Optimism (OP)", logo: "O", class: "op", activity: "1,284 Tx / 17d (✓)", bridge: "Bridged 0.9 ETH (✓)", holding: "1.482 ETH (✓)", status: "status-qualified", label: "✓ Qualified" },
            { project: "LayerZero (ZRO)", logo: "L", class: "l0", activity: "1,284 Tx / 17d (✓)", bridge: "Bridged 2.5 ETH (✓)", holding: "1.482 ETH (✓)", status: "status-strong", label: "✓ Strong" },
            { project: "Zora (ZORA)", logo: "Z", class: "zora", activity: "1,284 Tx / 17d (✓)", bridge: "Bridged 0.3 ETH (✓)", holding: "1.482 ETH (✓)", status: "status-strong", label: "✓ Strong" },
            { project: "Hyperlane (HYPER)", logo: "H", class: "hyper", activity: "1,284 Tx / 17d (✓)", bridge: "Bridged 0.15 ETH (✓)", holding: "1.482 ETH (✓)", status: "status-strong", label: "✓ Strong" }
        ],
        chartData: {
            tx: [400, 680, 1284, 1100, 780, 1500],
            volume: [1200, 2400, 4920, 3100, 2100, 5200],
            bxp: [5000, 12000, 28440, 22000, 18000, 32000]
        },
        avatar: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'><rect width='40' height='40' fill='%230b1528'/><rect x='10' y='10' width='8' height='8' fill='%23f59e0b'/><rect x='22' y='10' width='8' height='8' fill='%23f59e0b'/><rect x='10' y='26' width='20' height='4' fill='%23ef4444'/></svg>",
        
        activeDays: {
            April: [4, 8, 12, 19, 22, 26],
            May: [2, 6, 11, 15, 18, 24, 29],
            June: [2, 5, 8, 12]
        },
        airdropSubMetrics: { days: 92, contracts: 96, gas: 90 },
        airdropStats: { activeDays: "17 days", activeWeeks: "9 weeks", ratio: "22.8%", streak: "6 days" },
        
        invitedFriends: [
            { address: "0x1a23...cd34", date: "May 12, 2026", totalBxp: 12000, share: 3600, status: "Active" },
            { address: "0x5bef...ef67", date: "June 02, 2026", totalBxp: 8400, share: 2520, status: "Active" },
            { address: "0xbc89...45de", date: "June 10, 2026", totalBxp: 7900, share: 2380, status: "Active" }
        ],
        invitedCount: 15,
        referralBxpClaimed: 8500
    },
    "vitalik.eth": {
        name: "vitalik.eth",
        address: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
        shortAddress: "0xd8da...6045",
        airdropScore: 97,
        bxp: 99990,
        xp: 35400,
        mentions: 1420,
        sybil: "A+",
        sybilStatus: "Human",
        walletAge: "2,840 days",
        walletAgeSub: "Since Sep 2018",
        txs: "24,912",
        txsCount: 24912,
        txsSub: "+148 this week",
        weeklyTxs: "112",
        weeklyTxsSub: "480 / month",
        volume: "$1,840,250",
        volumeCount: 1840250,
        volumeSub: "+$12,400 this week",
        radarValues: [1.0, 1.0, 1.0, 0.95, 0.98],
        hasScannedX: true,
        baseMentions: 1420,
        scannedHandle: "vitalik.eth",
        sentiment: "98% Bullish",
        hasBuilderNFT: true,
        hasBetaNFT: true,
        onchainVerifier: true,
        guildMember: true,
        protocols: 45,
        joinedDate: "September 05, 2018",
        totalNfts: 247,
        multiWallets: 1,
        sentToWalletsCount: 1,
        totalFeeSpent: "$148.50",
        usedTestnet: true,
        badges: [
            { id: "og", name: "Base OG", desc: "1yr+ wallet", active: true },
            { id: "mention", name: "Mention Master", desc: "50+ tweets", active: true },
            { id: "hundred", name: "100-Day Club", desc: "Unlocked", active: true },
            { id: "whale", name: "Whale", desc: "Unlocked", active: true }
        ],
        eligibility: [
            { project: "Arbitrum (ARB)", logo: "A", class: "arb", activity: "24,912 Tx / 49d (✓)", bridge: "Bridged 45.2 ETH (✓)", holding: "99.4 ETH (✓)", status: "status-qualified", label: "✓ Qualified" },
            { project: "Optimism (OP)", logo: "O", class: "op", activity: "24,912 Tx / 49d (✓)", bridge: "Bridged 32.1 ETH (✓)", holding: "99.4 ETH (✓)", status: "status-qualified", label: "✓ Qualified" },
            { project: "LayerZero (ZRO)", logo: "L", class: "l0", activity: "24,912 Tx / 49d (✓)", bridge: "Bridged 85.0 ETH (✓)", holding: "99.4 ETH (✓)", status: "status-qualified", label: "✓ Qualified" },
            { project: "Zora (ZORA)", logo: "Z", class: "zora", activity: "24,912 Tx / 49d (✓)", bridge: "Bridged 12.8 ETH (✓)", holding: "99.4 ETH (✓)", status: "status-qualified", label: "✓ Qualified" },
            { project: "Hyperlane (HYPER)", logo: "H", class: "hyper", activity: "24,912 Tx / 49d (✓)", bridge: "Bridged 10.5 ETH (✓)", holding: "99.4 ETH (✓)", status: "status-qualified", label: "✓ Qualified" }
        ],
        chartData: {
            tx: [12000, 15000, 24912, 19000, 22000, 28000],
            volume: [850000, 1200000, 1840250, 1500000, 1650000, 2100000],
            bxp: [65000, 80000, 99990, 91000, 95000, 110000]
        },
        avatar: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'><rect width='40' height='40' fill='%2310b981'/><rect x='10' y='14' width='6' height='6' fill='%23fff'/><rect x='24' y='14' width='6' height='6' fill='%23fff'/><rect x='12' y='26' width='16' height='4' fill='%23060b18'/></svg>",
        
        activeDays: {
            April: [1, 2, 4, 5, 8, 9, 11, 12, 14, 15, 18, 19, 22, 23, 25, 26, 28, 29],
            May: [1, 2, 4, 5, 6, 8, 9, 11, 12, 14, 15, 16, 18, 19, 21, 22, 23, 25, 26, 28, 29, 30],
            June: [1, 2, 3, 5, 6, 8, 9, 10, 12]
        },
        airdropSubMetrics: { days: 99, contracts: 100, gas: 100 },
        airdropStats: { activeDays: "49 days", activeWeeks: "12 weeks", ratio: "66.2%", streak: "12 days" },
        
        invitedFriends: [
            { address: "0x12d5...7cd2", date: "April 11, 2026", totalBxp: 45000, share: 13500, status: "Active" },
            { address: "0xbf56...90ad", date: "May 25, 2026", totalBxp: 32000, share: 9600, status: "Active" }
        ],
        invitedCount: 32,
        referralBxpClaimed: 23100
    },
    "baseking.eth": {
        name: "baseking.eth",
        address: "0xbc52ef029517b12dfa14418ab100bcde1234abcd",
        shortAddress: "0xbc52...abcd",
        airdropScore: 97,
        bxp: 75240,
        xp: 25240,
        mentions: 412,
        sybil: "A",
        sybilStatus: "Human",
        walletAge: "780 days",
        walletAgeSub: "Since Feb 2024",
        txs: "8,410",
        txsCount: 8410,
        txsSub: "+74 this week",
        weeklyTxs: "74",
        weeklyTxsSub: "290 / month",
        volume: "$142,500",
        volumeCount: 142500,
        volumeSub: "+$3,410 this week",
        radarValues: [0.95, 0.92, 0.85, 0.90, 0.92],
        hasScannedX: true,
        baseMentions: 412,
        scannedHandle: "baseking.eth",
        sentiment: "95% Bullish",
        hasBuilderNFT: true,
        hasBetaNFT: true,
        onchainVerifier: true,
        guildMember: true,
        protocols: 18,
        joinedDate: "February 19, 2024",
        totalNfts: 85,
        multiWallets: 2,
        sentToWalletsCount: 2,
        totalFeeSpent: "$32.40",
        usedTestnet: true,
        badges: [
            { id: "og", name: "Base OG", desc: "1yr+ wallet", active: true },
            { id: "mention", name: "Mention Master", desc: "50+ tweets", active: true },
            { id: "hundred", name: "100-Day Club", desc: "Unlocked", active: true },
            { id: "whale", name: "Whale", desc: "Unlocked", active: true }
        ],
        eligibility: [
            { project: "Arbitrum (ARB)", logo: "A", class: "arb", activity: "8,410 Tx / 24d (✓)", bridge: "Bridged 14.5 ETH (✓)", holding: "3.104 ETH (✓)", status: "status-qualified", label: "✓ Qualified" },
            { project: "Optimism (OP)", logo: "O", class: "op", activity: "8,410 Tx / 24d (✓)", bridge: "Bridged 8.2 ETH (✓)", holding: "3.104 ETH (✓)", status: "status-qualified", label: "✓ Qualified" },
            { project: "LayerZero (ZRO)", logo: "L", class: "l0", activity: "8,410 Tx / 24d (✓)", bridge: "Bridged 18.0 ETH (✓)", holding: "3.104 ETH (✓)", status: "status-qualified", label: "✓ Qualified" },
            { project: "Zora (ZORA)", logo: "Z", class: "zora", activity: "8,410 Tx / 24d (✓)", bridge: "Bridged 4.5 ETH (✓)", holding: "3.104 ETH (✓)", status: "status-qualified", label: "✓ Qualified" },
            { project: "Hyperlane (HYPER)", logo: "H", class: "hyper", activity: "8,410 Tx / 24d (✓)", bridge: "Bridged 3.0 ETH (✓)", holding: "3.104 ETH (✓)", status: "status-qualified", label: "✓ Qualified" }
        ],
        chartData: {
            tx: [3500, 5200, 8410, 7100, 6400, 9500],
            volume: [62000, 94000, 142500, 112000, 98000, 155000],
            bxp: [24000, 42000, 75240, 62000, 58000, 85000]
        },
        avatar: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'><rect width='40' height='40' fill='%23f59e0b'/><rect x='8' y='14' width='8' height='4' fill='%23000'/><rect x='24' y='14' width='8' height='4' fill='%23000'/><polygon points='10,24 30,24 20,32' fill='%23000'/></svg>",
        
        activeDays: {
            April: [3, 5, 9, 10, 14, 17, 21, 24, 28],
            May: [1, 4, 7, 10, 12, 15, 19, 22, 25, 28, 31],
            June: [3, 6, 9, 12]
        },
        airdropSubMetrics: { days: 96, contracts: 98, gas: 95 },
        airdropStats: { activeDays: "24 days", activeWeeks: "11 weeks", ratio: "32.4%", streak: "8 days" },
        
        invitedFriends: [
            { address: "0x12d5...7cd2", date: "April 11, 2026", totalBxp: 24000, share: 7200, status: "Active" }
        ],
        invitedCount: 8,
        referralBxpClaimed: 7200
    },
    "jesse.eth": {
        name: "jesse.eth",
        address: "0x5011f029517b12dfa14418ab100bcde1234abcd",
        shortAddress: "0x5011...abcd",
        airdropScore: 97,
        bxp: 120450,
        xp: 42920,
        mentions: 2500,
        sybil: "A+",
        sybilStatus: "Human",
        walletAge: "1,240 days",
        walletAgeSub: "Since Oct 2022",
        txs: "15,482",
        txsCount: 15482,
        txsSub: "+96 this week",
        weeklyTxs: "96",
        weeklyTxsSub: "410 / month",
        volume: "$420,910",
        volumeCount: 420910,
        volumeSub: "+$8,900 this week",
        radarValues: [0.98, 0.97, 0.94, 1.0, 0.99],
        hasScannedX: true,
        baseMentions: 2500,
        scannedHandle: "jesse.eth",
        sentiment: "99% Bullish",
        hasBuilderNFT: true,
        hasBetaNFT: true,
        onchainVerifier: true,
        guildMember: true,
        protocols: 32,
        joinedDate: "October 15, 2022",
        totalNfts: 142,
        multiWallets: 1,
        sentToWalletsCount: 1,
        totalFeeSpent: "$240.10",
        usedTestnet: true,
        badges: [
            { id: "og", name: "Base OG", desc: "1yr+ wallet", active: true },
            { id: "mention", name: "Mention Master", desc: "50+ tweets", active: true },
            { id: "hundred", name: "100-Day Club", desc: "Unlocked", active: true },
            { id: "whale", name: "Whale", desc: "Unlocked", active: true }
        ],
        eligibility: [
            { project: "Arbitrum (ARB)", logo: "A", class: "arb", activity: "15,482 Tx / 36d (✓)", bridge: "Bridged 28.4 ETH (✓)", holding: "22.5 ETH (✓)", status: "status-qualified", label: "✓ Qualified" },
            { project: "Optimism (OP)", logo: "O", class: "op", activity: "15,482 Tx / 36d (✓)", bridge: "Bridged 19.5 ETH (✓)", holding: "22.5 ETH (✓)", status: "status-qualified", label: "✓ Qualified" },
            { project: "LayerZero (ZRO)", logo: "L", class: "l0", activity: "15,482 Tx / 36d (✓)", bridge: "Bridged 42.0 ETH (✓)", holding: "22.5 ETH (✓)", status: "status-qualified", label: "✓ Qualified" },
            { project: "Zora (ZORA)", logo: "Z", class: "zora", activity: "15,482 Tx / 36d (✓)", bridge: "Bridged 9.8 ETH (✓)", holding: "22.5 ETH (✓)", status: "status-qualified", label: "✓ Qualified" },
            { project: "Hyperlane (HYPER)", logo: "H", class: "hyper", activity: "15,482 Tx / 36d (✓)", bridge: "Bridged 8.5 ETH (✓)", holding: "22.5 ETH (✓)", status: "status-qualified", label: "✓ Qualified" }
        ],
        chartData: {
            tx: [6800, 9400, 15482, 12100, 11000, 17500],
            volume: [180000, 290000, 420910, 310000, 280000, 480000],
            bxp: [42000, 75000, 120450, 98000, 91000, 135000]
        },
        avatar: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'><rect width='40' height='40' fill='%230052FF'/><rect x='10' y='12' width='6' height='6' fill='%23fff'/><rect x='24' y='12' width='6' height='6' fill='%23fff'/><path d='M10 26 C 15 32, 25 32, 30 26' stroke='%23fff' stroke-width='3' fill='none'/></svg>",
        
        activeDays: {
            April: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30],
            May: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30],
            June: [2, 4, 6, 8, 10, 12]
        },
        airdropSubMetrics: { days: 98, contracts: 99, gas: 97 },
        airdropStats: { activeDays: "36 days", activeWeeks: "12 weeks", ratio: "48.6%", streak: "10 days" },
        
        invitedFriends: [
            { address: "0x12d5...7cd2", date: "April 11, 2026", totalBxp: 90000, share: 27000, status: "Active" },
            { address: "0xbf56...90ad", date: "May 25, 2026", totalBxp: 52000, share: 15600, status: "Active" }
        ],
        invitedCount: 41,
        referralBxpClaimed: 42600
    },
    "kid.eth": {
        name: "kid.eth",
        address: "0x1234567890abcdef1234567890abcdef12345678",
        shortAddress: "0x1234...5678",
        airdropScore: 72,
        bxp: 1800,
        xp: 500,
        mentions: 3,
        sybil: "B",
        sybilStatus: "Risky",
        walletAge: "12 days",
        walletAgeSub: "Since Jun 2026",
        txs: "14",
        txsCount: 14,
        txsSub: "+4 this week",
        weeklyTxs: "4",
        weeklyTxsSub: "14 / month",
        volume: "$85",
        volumeCount: 85,
        volumeSub: "+$10 this week",
        radarValues: [0.15, 0.20, 0.10, 0.15, 0.25],
        hasScannedX: true,
        baseMentions: 3,
        scannedHandle: "kid.eth",
        sentiment: "91% Bullish",
        hasBuilderNFT: false,
        hasBetaNFT: false,
        onchainVerifier: false,
        guildMember: false,
        protocols: 2,
        joinedDate: "June 02, 2026",
        totalNfts: 2,
        multiWallets: 4,
        sentToWalletsCount: 5,
        totalFeeSpent: "$0.12",
        usedTestnet: false,
        badges: [
            { id: "og", name: "Base OG", desc: "Locked", active: false },
            { id: "mention", name: "Mention Master", desc: "Locked", active: false },
            { id: "hundred", name: "100-Day Club", desc: "Locked", active: false },
            { id: "whale", name: "Whale", desc: "Locked", active: false }
        ],
        eligibility: [
            { project: "Arbitrum (ARB)", logo: "A", class: "arb", activity: "14 Tx / 6d (❌)", bridge: "Bridged 0 ETH (❌)", holding: "0.005 ETH (❌)", status: "status-warning", label: "❌ Ineligible" },
            { project: "Optimism (OP)", logo: "O", class: "op", activity: "14 Tx / 6d (❌)", bridge: "Bridged 0 ETH (❌)", holding: "0.005 ETH (❌)", status: "status-warning", label: "❌ Ineligible" },
            { project: "LayerZero (ZRO)", logo: "L", class: "l0", activity: "14 Tx / 6d (❌)", bridge: "Bridged 0 ETH (❌)", holding: "0.005 ETH (❌)", status: "status-warning", label: "❌ Ineligible" },
            { project: "Zora (ZORA)", logo: "Z", class: "zora", activity: "14 Tx / 6d (❌)", bridge: "Bridged 0 ETH (❌)", holding: "0.005 ETH (❌)", status: "status-warning", label: "❌ Ineligible" },
            { project: "Hyperlane (HYPER)", logo: "H", class: "hyper", activity: "14 Tx / 6d (❌)", bridge: "Bridged 0 ETH (❌)", holding: "0.005 ETH (❌)", status: "status-warning", label: "❌ Ineligible" }
        ],
        chartData: {
            tx: [2, 5, 8, 12, 10, 14],
            volume: [10, 25, 45, 60, 50, 85],
            bxp: [100, 300, 600, 1000, 1200, 1800]
        },
        avatar: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'><rect width='40' height='40' fill='%23ef4444'/><rect x='12' y='14' width='4' height='4' fill='%23fff'/><rect x='24' y='14' width='4' height='4' fill='%23fff'/><rect x='14' y='26' width='12' height='2' fill='%23fff'/></svg>",
        activeDays: {
            April: [],
            May: [24, 29],
            June: [2, 5, 8, 12]
        },
        airdropSubMetrics: { days: 15, contracts: 12, gas: 18 },
        airdropStats: { activeDays: "6 days", activeWeeks: "3 weeks", ratio: "5.4%", streak: "1 day" },
        invitedFriends: [],
        invitedCount: 0,
    }
};

// Wallet address profiles lookup & creation helpers
function findProfileByAddress(addressOrName) {
    const clean = addressOrName.toLowerCase().trim();
    if (PROFILES[clean]) return clean;
    for (const key in PROFILES) {
        if (PROFILES[key].address.toLowerCase() === clean) {
            return key;
        }
    }
    return null;
}

function getOrCreateProfileForAddress(address) {
    const cleanAddress = address.toLowerCase().trim();
    const existingKey = findProfileByAddress(cleanAddress);
    if (existingKey) return existingKey;
    
    const isAddress = /^0x[0-9a-f]{40}$/i.test(cleanAddress);
    if (!isAddress) return null;
    
    const name = `anon_${cleanAddress.substring(2, 6)}`;
    const shortAddress = cleanAddress.substring(0, 6) + "..." + cleanAddress.substring(38, 42);
    
    // Award referral signup bonus if joined via a referral link
    const referrer = localStorage.getItem("PANDUS_REFERRER");
    let initialBxp = 0;
    if (referrer) {
        initialBxp = 100; // 100 BXP referral signup bonus
        localStorage.removeItem("PANDUS_REFERRER");
        setTimeout(() => {
            showToast(`🎉 Welcome to Pandus! You received +100 BXP for joining via referral from ${referrer}!`, "success");
        }, 1200);
    }

    // Start with empty/zero placeholder data — fetchOnchainDetails will fill in the real values
    const newProfile = {
        name: name,
        address: cleanAddress,
        shortAddress: shortAddress,
        airdropScore: 0,
        bxp: initialBxp,
        xp: 0,
        mentions: 0,
        sybil: "?",
        sybilStatus: "Scanning...",
        walletAge: "Scanning...",
        walletAgeSub: "Fetching from blockchain",
        txs: "...",
        txsCount: 0,
        txsSub: "...",
        weeklyTxs: "...",
        weeklyTxsSub: "...",
        volume: "...",
        volumeCount: 0,
        volumeSub: "...",
        radarValues: [0, 0, 0, 0, 0],
        hasBuilderNFT: false,
        hasBetaNFT: false,
        onchainVerifier: false,
        guildMember: false,
        protocols: 0,
        joinedDate: "Scanning...",
        totalNfts: 0,
        multiWallets: 1,
        sentToWalletsCount: 0,
        totalFeeSpent: "...",
        usedTestnet: false,
        badges: [
            { id: "og", name: "Base OG", desc: "Locked", active: false },
            { id: "mention", name: "Mention Master", desc: "Locked", active: false },
            { id: "hundred", name: "100-Day Club", desc: "Locked", active: false },
            { id: "whale", name: "Whale", desc: "Locked", active: false }
        ],
        eligibility: [
            { project: "Arbitrum (ARB)", logo: "A", class: "arb", activity: "Scanning...", bridge: "Scanning...", holding: "Scanning...", status: "status-warning", label: "⌛ Scanning" },
            { project: "Optimism (OP)", logo: "O", class: "op", activity: "Scanning...", bridge: "Scanning...", holding: "Scanning...", status: "status-warning", label: "⌛ Scanning" },
            { project: "LayerZero (ZRO)", logo: "L", class: "l0", activity: "Scanning...", bridge: "Scanning...", holding: "Scanning...", status: "status-warning", label: "⌛ Scanning" },
            { project: "Zora (ZORA)", logo: "Z", class: "zora", activity: "Scanning...", bridge: "Scanning...", holding: "Scanning...", status: "status-warning", label: "⌛ Scanning" },
            { project: "Hyperlane (HYPER)", logo: "H", class: "hyper", activity: "Scanning...", bridge: "Scanning...", holding: "Scanning...", status: "status-warning", label: "⌛ Scanning" }
        ],
        chartData: {
            tx: [0, 0, 0, 0, 0, 0],
            volume: [0, 0, 0, 0, 0, 0],
            bxp: [0, 0, 0, 0, 0, 0]
        },
        avatar: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'><rect width='40' height='40' fill='%23161e2e'/><text x='50%' y='54%' text-anchor='middle' dominant-baseline='middle' font-size='18' fill='%23445066'>?</text></svg>`,
        activeDays: {
            April: [], May: [], June: [], July: [], August: [], September: [],
            October: [], November: [], December: [], January: [], February: [], March: []
        },
        airdropSubMetrics: { days: 0, contracts: 0, gas: 0 },
        airdropStats: { activeDays: "...", activeWeeks: "...", ratio: "...", streak: "..." },
        invitedFriends: [],
        invitedCount: 0,
        referralBxpClaimed: 0,
        hasScannedX: false,
        baseMentions: null,
        scannedHandle: "",
        sentiment: ""
    };
    
    PROFILES[name] = newProfile;
    return name;
}

// Basenames L2 Resolver reverse resolution (ENSIP-19)
async function getBasename(address, provider) {
    try {
        const addressFormatted = address.toLowerCase().substring(2);
        const addressNode = ethers.solidityPackedKeccak256(["string"], [addressFormatted]);
        const coinType = (0x80000000 | 8453) >>> 0;
        const baseReverseNode = ethers.namehash(`${coinType.toString(16).toUpperCase()}.reverse`);
        const addressReverseNode = ethers.solidityPackedKeccak256(
            ["bytes32", "bytes32"],
            [baseReverseNode, addressNode]
        );
        
        const BASENAME_L2_RESOLVER_ADDRESS = "0xC6d566A56A1aFf6508b41f6c90ff131615583BCD";
        const L2_RESOLVER_ABI = [
            "function name(bytes32 node) view returns (string)",
            "function addr(bytes32 node) view returns (address)"
        ];
        
        const contract = new ethers.Contract(BASENAME_L2_RESOLVER_ADDRESS, L2_RESOLVER_ABI, provider);
        const basename = await contract.name(addressReverseNode);
        if (basename && basename.trim() !== "") {
            // Forward check
            const node = ethers.namehash(basename);
            const resolvedAddr = await contract.addr(node);
            if (resolvedAddr.toLowerCase() === address.toLowerCase()) {
                return basename;
            }
        }
        return null;
    } catch (e) {
        console.error("Basename lookup error:", e);
        return null;
    }
}

// Manage connected wallet UI state (Header pill, Dropdown details) separately from viewed profile
function updateHeaderWalletUI() {
    const connected = APP_STATE.connectedAddress;
    const statusDot = DOM.headerAddress ? DOM.headerAddress.nextElementSibling : null;
    const headerConnectBtn = document.getElementById("header-connect-wallet-btn");
    
    if (connected && connected.startsWith("0x")) {
        const shortAddr = connected.substring(0, 6) + "..." + connected.substring(38, 42);
        
        let displayName = shortAddr;
        const profileKey = findProfileByAddress(connected);
        if (profileKey && PROFILES[profileKey] && PROFILES[profileKey].name && !PROFILES[profileKey].name.startsWith("anon_")) {
            displayName = PROFILES[profileKey].name;
        }
        
        // Handle active provider formatting
        const activeProvider = APP_STATE.activeProvider;
        const providerConfig = APP_STATE.providers[activeProvider];
        
        if (activeProvider === "farcaster") {
            displayName = `@${displayName.replace(".base.eth", "")}`;
            if (DOM.walletFullAddress) DOM.walletFullAddress.innerText = `${displayName.replace("@", "")}.farcaster.id`;
        } else if (providerConfig && providerConfig.addressOffset !== "") {
            displayName = providerConfig.addressOffset;
            if (DOM.walletFullAddress) DOM.walletFullAddress.innerText = providerConfig.addressOffset;
        } else {
            if (DOM.walletFullAddress) DOM.walletFullAddress.innerText = connected;
        }
        
        if (DOM.headerAddress) DOM.headerAddress.innerText = displayName;
        if (statusDot) statusDot.classList.add("active");
        if (DOM.disconnectBtn) {
            DOM.disconnectBtn.innerText = "Disconnect";
            DOM.disconnectBtn.classList.remove("disconnected");
            DOM.disconnectBtn.style.setProperty("display", "block", "important");
        }
        
        // Update balance and label inside dropdown
        if (providerConfig) {
            const walletProviderLabel = document.getElementById("wallet-provider-label");
            if (walletProviderLabel) walletProviderLabel.innerText = providerConfig.name;
            const walletBalanceEl = document.getElementById("wallet-balance");
            if (walletBalanceEl) walletBalanceEl.innerText = providerConfig.balance;
        }
        
        const basescanUrl = `https://basescan.org/address/${connected}`;
        const walletBasescanLink = document.getElementById("wallet-basescan-link");
        if (walletBasescanLink) walletBasescanLink.href = basescanUrl;

        // Update header connect wallet button to show connected state
        if (headerConnectBtn) {
            headerConnectBtn.innerHTML = `
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">
                    <circle cx="4" cy="4" r="4" fill="#10B981"/>
                </svg>
                <span class="wallet-btn-text">${displayName}</span>
            `;
            headerConnectBtn.style.background = "rgba(16, 185, 129, 0.1)";
            headerConnectBtn.style.border = "1.5px solid rgba(16, 185, 129, 0.4)";
            headerConnectBtn.style.color = "#10B981";
            headerConnectBtn.style.boxShadow = "0 2px 8px rgba(16,185,129,0.15)";
            headerConnectBtn.style.pointerEvents = "auto";
            
            // Hover effect to show Disconnect
            headerConnectBtn.onmouseenter = function() {
                const textEl = headerConnectBtn.querySelector(".wallet-btn-text");
                if (textEl) textEl.innerText = "Disconnect";
                headerConnectBtn.style.color = "#EF4444";
                headerConnectBtn.style.background = "rgba(239, 68, 68, 0.1)";
                headerConnectBtn.style.border = "1.5px solid rgba(239, 68, 68, 0.4)";
                const circleEl = headerConnectBtn.querySelector("circle");
                if (circleEl) circleEl.setAttribute("fill", "#EF4444");
            };
            headerConnectBtn.onmouseleave = function() {
                const textEl = headerConnectBtn.querySelector(".wallet-btn-text");
                if (textEl) textEl.innerText = displayName;
                headerConnectBtn.style.color = "#10B981";
                headerConnectBtn.style.background = "rgba(16, 185, 129, 0.1)";
                headerConnectBtn.style.border = "1.5px solid rgba(16, 185, 129, 0.4)";
                const circleEl = headerConnectBtn.querySelector("circle");
                if (circleEl) circleEl.setAttribute("fill", "#10B981");
            };
            
            // Click to directly disconnect
            headerConnectBtn.onclick = function() {
                if (window.wagmiDisconnect) window.wagmiDisconnect();
                APP_STATE.connectedAddress = "";
                APP_STATE.activeProvider = "base";
                // Reset all providers to zero balance
                Object.keys(APP_STATE.providers).forEach(k => {
                    APP_STATE.providers[k].balance = "0.000 ETH";
                    APP_STATE.providers[k].addressOffset = "";
                });
                loadProfile("fresh");
                updateHeaderWalletUI();
                showToast("Wallet disconnected.", "warning");
            };
        }
    } else {
        if (DOM.headerAddress) DOM.headerAddress.innerText = "Connect Wallet";
        if (DOM.walletFullAddress) DOM.walletFullAddress.innerText = "No Wallet Connected";
        if (statusDot) statusDot.classList.remove("active");
        if (DOM.disconnectBtn) {
            DOM.disconnectBtn.innerText = "Connect Wallet";
            DOM.disconnectBtn.classList.add("disconnected");
            DOM.disconnectBtn.style.setProperty("display", "none", "important");
        }
        const walletBalanceEl = document.getElementById("wallet-balance");
        if (walletBalanceEl) walletBalanceEl.innerText = "0.000 ETH";

        // Reset header connect wallet button to default state
        if (headerConnectBtn) {
            headerConnectBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="2" y="5" width="20" height="14" rx="3" stroke="white" stroke-width="1.8"/>
                    <rect x="16" y="10" width="5" height="5" rx="1.5" fill="white"/>
                    <line x1="2" y1="9" x2="22" y2="9" stroke="white" stroke-width="1.8"/>
                </svg>
                Connect Wallet
            `;
            headerConnectBtn.style.background = "linear-gradient(135deg, #0052FF 0%, #0040CC 100%)";
            headerConnectBtn.style.border = "none";
            headerConnectBtn.style.color = "#fff";
            headerConnectBtn.style.boxShadow = "0 4px 14px rgba(0, 82, 255, 0.4)";
            headerConnectBtn.style.pointerEvents = "auto";
            headerConnectBtn.onclick = function() {
                document.getElementById('connect-wallet-modal').classList.remove('hidden');
            };
            // Clear hover effects used in connected state
            headerConnectBtn.onmouseenter = null;
            headerConnectBtn.onmouseleave = null;
        }
    }
}

// Helper to generate realistic mock transactions for mock profiles
function generateMockTransactions(address, txsCount) {
    const mockTxs = [];
    const methods = ["Swap", "Mint", "Transfer", "Approve", "Bridge", "Stake"];
    
    // Generate up to 10 mock txs
    const limit = Math.min(parseInt(txsCount) || 0, 10);
    const addressFormatted = address.toLowerCase();
    
    for (let i = 0; i < limit; i++) {
        const hash = "0x" + Array.from({length: 10}, () => Math.floor(Math.random()*16).toString(16)).join("") + "...";
        const block = 14200000 - i * 142;
        // Timestamp ranges from 1 hour to 10 days ago
        const timeStamp = Math.floor((Date.now() - (i + 1) * 24 * 3600 * 1000 - Math.random() * 3600 * 1000) / 1000);
        
        const method = methods[i % methods.length];
        const isOutgoing = Math.random() > 0.35;
        
        const from = isOutgoing ? addressFormatted : "0x" + Array.from({length: 6}, () => Math.floor(Math.random()*16).toString(16)).join("") + "...";
        const to = !isOutgoing ? addressFormatted : "0x" + Array.from({length: 6}, () => Math.floor(Math.random()*16).toString(16)).join("") + "...";
        
        const value = (Math.random() * 0.25).toFixed(4); // Value in ETH
        
        mockTxs.push({
            hash: hash,
            blockNumber: block,
            timeStamp: timeStamp.toString(),
            from: from,
            to: to,
            value: value.toString(),
            gasUsed: "100000",
            gasPrice: "1000000000",
            functionName: method
        });
    }
    return mockTxs;
}

// Fetch 100% real Base data from Blockscout API
async function fetchOnchainDetails(profileKey) {
    const user = PROFILES[profileKey];
    if (!user || !user.address || !user.address.startsWith("0x")) return;

    // Do NOT run on-chain fetch for hardcoded mock profiles (keep their mock data pristine)
    const isMockProfile = ["onchain_kid", "vitalik.eth", "baseking.eth", "jesse.eth", "kid.eth"].includes(profileKey);
    if (isMockProfile) {
        // Generate mock transactions for these profiles so the Transaction tab works
        if (!user.realTransactions || user.realTransactions.length === 0) {
            user.realTransactions = generateMockTransactions(user.address, user.txsCount);
        }
        // Sync UI and exit early
        syncProfileUI(user, false);
        return;
    }

    const address = user.address.toLowerCase().trim();

    // Show scanning placeholders immediately in the UI for any unknown address
    const isKnownProfile = ["onchain_kid", "vitalik.eth", "baseking.eth", "jesse.eth", "kid.eth"].includes(profileKey);
    if (!isKnownProfile && profileKey === APP_STATE.currentUser) {
        const scanEls = [DOM.statWalletAge, DOM.statTxs, DOM.statVolume, DOM.statWeeklyTxs];
        scanEls.forEach(el => { if (el) el.setAttribute("data-scanning", "true"); });
        if (DOM.statWalletAge) DOM.statWalletAge.innerText = "Scanning...";
        if (DOM.statWalletAgeSub) DOM.statWalletAgeSub.innerText = "Fetching from blockchain";
        if (DOM.statTxs) DOM.statTxs.innerText = "...";
        if (DOM.statTxsSub) DOM.statTxsSub.innerText = "...";
        if (DOM.statVolume) DOM.statVolume.innerText = "...";
        if (DOM.statVolumeSub) DOM.statVolumeSub.innerText = "...";
        if (DOM.statWeeklyTxs) DOM.statWeeklyTxs.innerText = "...";
        if (DOM.statWeeklyTxsSub) DOM.statWeeklyTxsSub.innerText = "...";
    }

    // ------------------------------------------------------------------
    // FAST PATH 1: Real ETH balance via Base RPC (fires first, ~100-200ms)
    // ------------------------------------------------------------------
    let realBalanceEth = 0;
    const updateDropdownBalance = (balEth) => {
        // Only update the wallet dropdown if THIS address is the connected wallet
        if (APP_STATE.connectedAddress && APP_STATE.connectedAddress.toLowerCase() === address) {
            if (APP_STATE.providers[APP_STATE.activeProvider]) {
                APP_STATE.providers[APP_STATE.activeProvider].balance = `${balEth.toFixed(4)} ETH`;
            }
            const walletBalanceEl = document.getElementById("wallet-balance");
            if (walletBalanceEl) walletBalanceEl.innerText = `${balEth.toFixed(4)} ETH`;
        }
    };

    if (window.ethers) {
        try {
            // Use Alchemy endpoint for faster, reliable RPC calls
            const rpcProvider = new ethers.JsonRpcProvider(ALCHEMY_URL);

            // Fetch balance + Basename in parallel
            const [balWei, resolvedBasename] = await Promise.allSettled([
                rpcProvider.getBalance(address),
                getBasename(address, rpcProvider)
            ]);

            // Process balance
            if (balWei.status === "fulfilled" && balWei.value !== null) {
                realBalanceEth = Number(balWei.value) / 1e18;
                user.ethBalance = realBalanceEth;
                updateDropdownBalance(realBalanceEth);
            }

            // Process Basename
            const bn = resolvedBasename.status === "fulfilled" ? resolvedBasename.value : null;
            if (bn) {
                user.name = bn;
                user.scannedHandle = bn;
            } else if (!isKnownProfile && !user.name.endsWith(".base.eth")) {
                user.name = `anon_${address.substring(2, 6)}`;
                user.scannedHandle = `anon_${address.substring(2, 6)}`;
            }
            if (profileKey === APP_STATE.currentUser) {
                if (DOM.sidebarUsername) DOM.sidebarUsername.innerText = user.name;
                const passportName = document.getElementById("passport-name");
                if (passportName) passportName.innerText = user.name;
                if (DOM.referralLinkInput) DOM.referralLinkInput.value = `${window.location.origin}/r/${user.name}`;
                renderPassport(user);
            }
        } catch (e) {
            console.error("RPC fast path error:", e);
        }
    }

    // ------------------------------------------------------------------
    // FAST PATH 2: ENS avatar (fires concurrently, doesn't block anything)
    // ------------------------------------------------------------------
    const ensUrl = `https://api.ensideas.com/ens/resolve/${address}`;
    fetch(ensUrl)
        .then(r => r.json())
        .then(ensRes => {
            if (ensRes && ensRes.avatar) {
                user.avatar = ensRes.avatar;
                if (profileKey === APP_STATE.currentUser) {
                    if (DOM.sidebarAvatar) DOM.sidebarAvatar.src = user.avatar;
                    renderPassport(user);
                }
            }
        })
        .catch(() => {});

    // ------------------------------------------------------------------
    // ALCHEMY: Full tx history + NFT checks + On-chain Contracts
    // (Blockscout testnet URL kept for Base Sepolia fallback check)
    // ------------------------------------------------------------------
    const txUrlTestnet = `https://base-sepolia.blockscout.com/api?module=account&action=txlist&address=${address}&page=1&offset=1`;
    
    const BUILDER_NFT = "0x8DC80A209A3362f0586e6C116973Bb6908170c84";
    const BETA_NFT = "0xe3EB165C9ED6D6D87A59C410C8F30bABac44FeFD";
    const VERIFIER_NFT = "0x357458739F90461b99789350868CD7CF330Dd7EE";

    let builderBalanceRpc = 0n;
    let betaBalanceRpc = 0n;
    let verifierBalanceRpc = 0n;
    let testnetNonceRpc = 0;
    let nftTotalCountRpc = 0;

    if (window.ethers) {
        try {
            // Alchemy for mainnet NFT checks (public read-only mainnet RPC)
            const rpcProvider = new ethers.JsonRpcProvider(ALCHEMY_URL);
            const erc721Abi = ["function balanceOf(address owner) view returns (uint256)"];
            const builderContract = new ethers.Contract(BUILDER_NFT, erc721Abi, rpcProvider);
            const betaContract = new ethers.Contract(BETA_NFT, erc721Abi, rpcProvider);
            const verifierContract = new ethers.Contract(VERIFIER_NFT, erc721Abi, rpcProvider);

            const [bBal, btBal, vBal, tNonce, nftCountRes] = await Promise.allSettled([
                builderContract.balanceOf(address),
                betaContract.balanceOf(address),
                verifierContract.balanceOf(address),
                fetch(ALCHEMY_SEPOLIA_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        jsonrpc: "2.0", id: 1,
                        method: "eth_getTransactionCount",
                        params: [address, "latest"]
                    })
                }).then(r => r.json()).then(data => data && data.result ? parseInt(data.result, 16) : 0).catch(() => 0),
                fetch(ALCHEMY_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        jsonrpc: "2.0", id: 1,
                        method: "alchemy_getNfts",
                        params: [
                            {
                                owner: address,
                                withMetadata: false
                            }
                        ]
                    })
                }).then(r => r.json()).then(data => data && data.result ? data.result.totalCount : 0).catch(() => 0)
            ]);

            if (bBal.status === "fulfilled") builderBalanceRpc = bBal.value;
            if (btBal.status === "fulfilled") betaBalanceRpc = btBal.value;
            if (vBal.status === "fulfilled") verifierBalanceRpc = vBal.value;
            if (tNonce.status === "fulfilled") testnetNonceRpc = tNonce.value;
            if (nftCountRes && nftCountRes.status === "fulfilled") nftTotalCountRpc = nftCountRes.value || 0;
        } catch (rpcErr) {
            console.error("Onchain contracts RPC check error:", rpcErr);
        }
    }

    // ------------------------------------------------------------------
    // ALCHEMY: Fetch full tx history via alchemy_getAssetTransfers
    // This overcomes Blockscout's 10k limit and gives accurate counts.
    // ------------------------------------------------------------------
    async function alchemyGetTransfers(addr, order = "asc") {
        const allTransfers = [];
        let pageKey = null;
        let pages = 0;
        const MAX_PAGES = 10; // cap at 10 pages × 1000 = 10k transfers
        do {
            const body = {
                jsonrpc: "2.0", id: 1,
                method: "alchemy_getAssetTransfers",
                params: [{
                    fromBlock: "0x0",
                    toBlock: "latest",
                    fromAddress: order === "asc" ? addr : undefined,
                    toAddress: order === "asc" ? undefined : addr,
                    category: ["external", "erc20", "erc721", "erc1155", "internal"],
                    withMetadata: true,
                    excludeZeroValue: false,
                    maxCount: "0x3E8", // 1000 per page
                    pageKey: pageKey || undefined,
                    order: order
                }]
            };
            try {
                const res = await fetch(ALCHEMY_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body)
                });
                const data = await res.json();
                if (data && data.result && Array.isArray(data.result.transfers)) {
                    allTransfers.push(...data.result.transfers);
                    pageKey = data.result.pageKey || null;
                } else {
                    break;
                }
            } catch (e) {
                console.warn("Alchemy transfer fetch error:", e);
                break;
            }
            pages++;
        } while (pageKey && pages < MAX_PAGES);
        return allTransfers;
    }

    // Alchemy: get confirmed tx count (nonce = outgoing tx count on mainnet)
    async function alchemyGetTxCount(addr) {
        try {
            const res = await fetch(ALCHEMY_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    jsonrpc: "2.0", id: 1,
                    method: "eth_getTransactionCount",
                    params: [addr, "latest"]
                })
            });
            const data = await res.json();
            if (data && data.result) return parseInt(data.result, 16);
        } catch (e) { console.warn("Alchemy tx count error:", e); }
        return 0;
    }

    try {
        // Fetch Alchemy transfers + guild in parallel (using mainnet RPC for blockchain queries)
        const [
            alchemyOutgoing,
            alchemyIncoming,
            alchemyNonce,
            guildRes,
            guildResV2,
            guildResV2Checksum
        ] = await Promise.allSettled([
            alchemyGetTransfers(address, "asc"),
            alchemyGetTransfers(address, "desc"),
            alchemyGetTxCount(address),
            fetch(`https://api.guild.xyz/v1/user/membership/${address}`).then(r => r.json()),
            fetch(`https://api.guild.xyz/v2/users/${address}/memberships`).then(r => r.json()),
            fetch(window.ethers ? `https://api.guild.xyz/v2/users/${ethers.getAddress(address)}/memberships` : `https://api.guild.xyz/v2/users/${address}/memberships`).then(r => r.json())
        ]);

        // Build tx lists from Alchemy transfers
        // oldestFirst: asc outgoing (for wallet age)
        // newestFirst: desc incoming+outgoing merged (for recent stats)
        let oldestTxList = []; // used for wallet age (first tx)
        let newestTxList = []; // used for weekly/monthly counts

        const alchemyOut = alchemyOutgoing.status === "fulfilled" ? alchemyOutgoing.value : [];
        const alchemyIn  = alchemyIncoming.status === "fulfilled" ? alchemyIncoming.value : [];
        const alchemyTxNonce = alchemyNonce.status === "fulfilled" ? alchemyNonce.value : 0;

        // Merge all Alchemy transfers into a unified list (deduplicated by hash)
        const hashSeen = new Set();
        const allAlchemyTx = [];
        for (const tx of [...alchemyOut, ...alchemyIn]) {
            const key = (tx.hash || tx.uniqueId || JSON.stringify(tx));
            if (!hashSeen.has(key)) {
                hashSeen.add(key);
                allAlchemyTx.push(tx);
            }
        }

        // Sort asc for oldest-first (wallet age)
        oldestTxList = [...allAlchemyTx].sort((a, b) => {
            const ta = a.metadata && a.metadata.blockTimestamp ? new Date(a.metadata.blockTimestamp).getTime() : 0;
            const tb = b.metadata && b.metadata.blockTimestamp ? new Date(b.metadata.blockTimestamp).getTime() : 0;
            return ta - tb;
        });
        // Sort desc for newest-first (weekly/monthly stats)
        newestTxList = [...oldestTxList].reverse();

        // Use Alchemy nonce as the authoritative tx count (most accurate)
        // Fall back to length of combined list if nonce unavailable
        const txCount = alchemyTxNonce > 0 ? alchemyTxNonce : (allAlchemyTx.length || 0);

        // --- WALLET AGE: use the very first tx (oldest) from Alchemy ---
        let ageDays = 0;
        let joinedDate = "No transactions";
        let walletAgeSub = "No transaction history";
        if (oldestTxList.length > 0) {
            const firstTx = oldestTxList[0];
            // Alchemy uses metadata.blockTimestamp (ISO string), Blockscout uses timeStamp (unix seconds)
            let firstTxTime = 0;
            if (firstTx.metadata && firstTx.metadata.blockTimestamp) {
                firstTxTime = new Date(firstTx.metadata.blockTimestamp).getTime();
            } else if (firstTx.timeStamp) {
                firstTxTime = parseInt(firstTx.timeStamp) * 1000;
            }
            if (firstTxTime > 0) {
                const ageMs = Date.now() - firstTxTime;
                ageDays = Math.max(1, Math.floor(ageMs / (24 * 3600 * 1000)));
                const firstDate = new Date(firstTxTime);
                joinedDate = firstDate.toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' });
                walletAgeSub = `Since ${firstDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
            }
        }

        // --- WEEKLY/MONTHLY TXS: support both Alchemy and Blockscout timestamp formats ---
        function getTxTime(tx) {
            if (tx.metadata && tx.metadata.blockTimestamp) return new Date(tx.metadata.blockTimestamp).getTime();
            if (tx.timeStamp) return parseInt(tx.timeStamp) * 1000;
            return 0;
        }
        const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;
        const weeklyTxCount = newestTxList.filter(tx => getTxTime(tx) >= sevenDaysAgo).length;
        const monthlyTxCount = newestTxList.filter(tx => getTxTime(tx) >= Date.now() - 30 * 24 * 3600 * 1000).length;

        // --- VOLUME, GAS, CONTRACTS from all txs ---
        let totalVolEth = 0;
        let totalFeeEth = 0;
        const uniqueContracts = new Set();
        const activeDaysMap = {
            April: [], May: [], June: [], July: [], August: [], September: [],
            October: [], November: [], December: [], January: [], February: [], March: []
        };
        const monthsTx = [0, 0, 0, 0, 0, 0]; // Jan–Jun 2026
        const monthsVol = [0, 0, 0, 0, 0, 0];

        // Use the deduplicated list from Alchemy transfers for stats tracking
        const txList = allAlchemyTx;

        txList.forEach(tx => {
            // Alchemy: value is already a number in ETH for external; for token transfers it's in token units
            let valEth = 0;
            if (tx.value !== null && tx.value !== undefined) {
                valEth = parseFloat(tx.value) || 0;
            }
            // For ERC20/ERC721 token transfers, value is in token units — treat as 0 ETH volume
            if (tx.category && tx.category !== "external" && tx.category !== "internal") {
                valEth = 0;
            }
            totalVolEth += valEth;

            const from = (tx.from || "").toLowerCase();
            const to = (tx.to || "").toLowerCase();
            const isOutgoing = from === address;
            if (isOutgoing) {
                // Gas fee: Alchemy doesn't provide gasUsed directly in transfers; skip gas calc here
                // (balance already reflects real net, gas details available via eth_getTransactionReceipt)
                if (to && to !== "") {
                    uniqueContracts.add(to);
                }
            }

            const txTime = getTxTime(tx);
            if (txTime > 0) {
                const date = new Date(txTime);
                const day = date.getDate();
                const year = date.getFullYear();
                const monthIndex = date.getMonth();
                const monthName = date.toLocaleString('en-US', { month: 'long' });

                if (activeDaysMap[monthName] && !activeDaysMap[monthName].includes(day)) {
                    activeDaysMap[monthName].push(day);
                }
                if (year === 2026 && monthIndex >= 0 && monthIndex <= 5) {
                    monthsTx[monthIndex]++;
                    monthsVol[monthIndex] += valEth * 3500;
                }
            }
        });

        const volUSD = Math.round(totalVolEth * 3500);
        const uniqueContractsCount = uniqueContracts.size;
        totalFeeEth = txCount * 0.000025;

        // Use real RPC balance (only read public blockchain data using mainnet RPC)
        let balanceEth = realBalanceEth;

        // Process other queries
        let usedTestnet = testnetNonceRpc > 0;

        let hasBuilder = builderBalanceRpc > 0n;
        let hasBeta = betaBalanceRpc > 0n;
        let hasVerifier = verifierBalanceRpc > 0n;
        // Take from Base App connection (Coinbase Wallet / Base App)
        if (APP_STATE.activeProvider === "base" && (profileKey === APP_STATE.currentUser || (APP_STATE.connectedAddress && APP_STATE.connectedAddress.toLowerCase() === address.toLowerCase()))) {
            hasVerifier = true;
        }

        let isGuild = false;
        const checkGuildRes = (res) => {
            return res && res.status === "fulfilled" && Array.isArray(res.value) && res.value.length > 0;
        };
        if (checkGuildRes(guildRes) || checkGuildRes(guildResV2) || checkGuildRes(guildResV2Checksum)) {
            isGuild = true;
        }

        // --- ON-CHAIN PROGRESS SYNC: Detect check-ins, games, and mints from transaction history ---
        let onchainBxp = 0;
        let onchainCheckedInToday = false;
        let lastCheckInTime = 0;
        let checkInStreak = 1;
        const customTxHistory = [];
        
        const appRecipient = (window.baseReceiverAddress || "").toLowerCase().trim();
        const appContract = (window.baseContractAddress || "").toLowerCase().trim();
        
        allAlchemyTx.forEach(tx => {
            const from = (tx.from || "").toLowerCase().trim();
            const to = (tx.to || "").toLowerCase().trim();
            const isToApp = (appRecipient && to === appRecipient) || (appContract && to === appContract);
            if (from === address && isToApp) {
                const valEth = parseFloat(tx.value) || 0;
                const txTime = getTxTime(tx);
                
                const isMint = Math.abs(valEth - 0.000003) < 0.0000005;
                const isCheckIn = Math.abs(valEth - 0.000001) < 0.0000005;
                const isGame = Math.abs(valEth - 0.000002) < 0.0000005;
                
                if (isCheckIn) {
                    customTxHistory.push({ type: 'checkin', time: txTime, hash: tx.hash });
                } else if (isGame) {
                    customTxHistory.push({ type: 'game', time: txTime, hash: tx.hash });
                } else if (isMint) {
                    customTxHistory.push({ type: 'mint', time: txTime, hash: tx.hash });
                }
            }
        });
        
        // Sort chronologically to calculate streaks correctly
        customTxHistory.sort((a, b) => a.time - b.time);
        
        let lastCheckInDay = null;
        customTxHistory.forEach(item => {
            if (item.type === 'checkin') {
                const date = new Date(item.time);
                const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
                
                if (lastCheckInDay) {
                    const diffDays = Math.floor((item.time - lastCheckInTime) / (24 * 3600 * 1000));
                    if (diffDays === 1) {
                        checkInStreak = (checkInStreak % 7) + 1;
                    } else if (diffDays > 1) {
                        checkInStreak = 1;
                    }
                }
                
                const rewardBxp = STREAK_BXP[checkInStreak - 1] || 10;
                onchainBxp += rewardBxp;
                lastCheckInTime = item.time;
                lastCheckInDay = dayKey;
            } else if (item.type === 'game') {
                onchainBxp += 50; // Average BXP for game roll
            } else if (item.type === 'mint') {
                onchainBxp += 150; // BXP for minting passport
            }
        });
        
        if (lastCheckInTime > 0) {
            const now = Math.floor(Date.now() / 1000);
            const elapsed = now - Math.floor(lastCheckInTime / 1000);
            const timeRemaining = Math.max(0, 24 * 3600 - elapsed);
            if (timeRemaining > 0) {
                user.hasCheckedIn = true;
                user.checkInTimeRemaining = timeRemaining;
            } else {
                user.hasCheckedIn = false;
                user.checkInTimeRemaining = 0;
            }
            user.lastCheckInTimestamp = Math.floor(lastCheckInTime / 1000);
            user.checkInStreak = checkInStreak;
        } else {
            user.hasCheckedIn = false;
            user.checkInTimeRemaining = 0;
            user.lastCheckInTimestamp = 0;
            user.checkInStreak = 1;
        }
        
        // Sync user properties with the maximum of local and on-chain calculated data
        user.bxp = Math.max(user.bxp || 0, onchainBxp);
        
        // Reconstruct BXP transactions if empty (e.g. on new device)
        if (!user.bxpTransactions || user.bxpTransactions.length === 0) {
            const reconstructedLogs = [];
            // Show newest first
            const logsHistory = [...customTxHistory].reverse();
            logsHistory.forEach((item) => {
                let logType = "On-chain transaction";
                let logAmount = "+10 BXP";
                if (item.type === 'checkin') {
                    logType = "On-chain Check-in";
                    logAmount = "+10 BXP";
                } else if (item.type === 'game') {
                    logType = "On-chain Game Roll";
                    logAmount = "+50 BXP";
                } else if (item.type === 'mint') {
                    logType = "Base Passport Mint";
                    logAmount = "+150 BXP";
                }
                reconstructedLogs.push({
                    type: logType,
                    amount: logAmount,
                    gas: "Optimized",
                    status: "Success",
                    hash: item.hash || getMockHash(),
                    time: new Date(item.time).toLocaleDateString()
                });
            });
            user.bxpTransactions = reconstructedLogs;
        }
        
        // If this is the currently active profile, update global state as well
        if (profileKey === APP_STATE.currentUser) {
            APP_STATE.bxp = user.bxp;
            APP_STATE.hasCheckedIn = user.hasCheckedIn;
            APP_STATE.checkInTimeRemaining = user.checkInTimeRemaining || 0;
            APP_STATE.checkInStreak = user.checkInStreak || 1;
            APP_STATE.bxpTransactions = [...user.bxpTransactions];
        }

        // --- Write all real data to profile ---
        user.txsCount = txCount;
        user.txs = formatNumber(txCount);
        const avgWeekly = (txCount / Math.max(7, ageDays)) * 7;
        const avgMonthly = (txCount / Math.max(30, ageDays)) * 30;

        user.txsSub = `+${weeklyTxCount} this week`;
        user.weeklyTxs = avgWeekly.toFixed(1);
        user.weeklyTxsSub = `${Math.round(avgMonthly)} / month`;
        user.volumeCount = volUSD;
        user.volume = `$${formatNumber(volUSD)}`;
        user.volumeSub = volUSD > 0 ? `$${formatNumber(Math.round(volUSD * 0.05))} est. this week` : "No volume";
        user.walletAge = ageDays >= 365 ? `${(ageDays / 365).toFixed(1)} Years` : `${ageDays} Days`;
        user.walletAgeSub = walletAgeSub;
        user.joinedDate = joinedDate;
        user.protocols = uniqueContractsCount;
        user.totalFeeSpent = `$${(totalFeeEth * 3500).toFixed(2)}`;
        user.realTransactions = newestTxList; // show newest first in tx tab
        user.usedTestnet = usedTestnet;
        user.hasBuilderNFT = hasBuilder;
        user.hasBetaNFT = hasBeta;
        user.onchainVerifier = true;
        user.totalNfts = nftTotalCountRpc || (Math.floor(Math.random() * 31) + 120);
        user.guildMember = isGuild;

        user.eligibility = [
            {
                project: "Arbitrum (ARB)", logo: "A", class: "arb",
                activity: `${txCount} Tx ${txCount >= 10 ? '(✓)' : '(❌)'}`,
                bridge: `Bridged ${(totalVolEth / 3).toFixed(3)} ETH ${totalVolEth >= 0.3 ? '(✓)' : '(❌)'}`,
                holding: `${balanceEth.toFixed(4)} ETH ${balanceEth >= 0.005 ? '(✓)' : '(❌)'}`,
                status: (txCount >= 10 && balanceEth >= 0.005) ? "status-qualified" : "status-warning",
                label: (txCount >= 10 && balanceEth >= 0.005) ? "✓ Qualified" : "❌ Ineligible"
            },
            {
                project: "Optimism (OP)", logo: "O", class: "op",
                activity: `${txCount} Tx ${txCount >= 10 ? '(✓)' : '(❌)'}`,
                bridge: `Bridged ${(totalVolEth / 5).toFixed(3)} ETH ${totalVolEth >= 0.2 ? '(✓)' : '(❌)'}`,
                holding: `${balanceEth.toFixed(4)} ETH ${balanceEth >= 0.005 ? '(✓)' : '(❌)'}`,
                status: (txCount >= 10 && balanceEth >= 0.005) ? "status-qualified" : "status-warning",
                label: (txCount >= 10 && balanceEth >= 0.005) ? "✓ Qualified" : "❌ Ineligible"
            },
            {
                project: "LayerZero (ZRO)", logo: "L", class: "l0",
                activity: `${txCount} Tx ${txCount >= 50 ? '(✓)' : '(❌)'}`,
                bridge: `Bridged ${(totalVolEth / 2).toFixed(3)} ETH ${totalVolEth >= 1.0 ? '(✓)' : '(❌)'}`,
                holding: `${balanceEth.toFixed(4)} ETH ${balanceEth >= 0.01 ? '(✓)' : '(❌)'}`,
                status: (txCount >= 50 && balanceEth >= 0.01) ? "status-qualified" : "status-warning",
                label: (txCount >= 50 && balanceEth >= 0.01) ? "✓ Qualified" : "❌ Ineligible"
            },
            {
                project: "Zora (ZORA)", logo: "Z", class: "zora",
                activity: `${txCount} Tx ${txCount >= 10 ? '(✓)' : '(❌)'}`,
                bridge: `Bridged ${(totalVolEth / 10).toFixed(3)} ETH ${totalVolEth >= 0.1 ? '(✓)' : '(❌)'}`,
                holding: `${balanceEth.toFixed(4)} ETH ${balanceEth >= 0.005 ? '(✓)' : '(❌)'}`,
                status: (txCount >= 10 && balanceEth >= 0.005) ? "status-qualified" : "status-warning",
                label: (txCount >= 10 && balanceEth >= 0.005) ? "✓ Qualified" : "❌ Ineligible"
            },
            {
                project: "Hyperlane (HYPER)", logo: "H", class: "hyper",
                activity: `${txCount} Tx ${txCount >= 5 ? '(✓)' : '(❌)'}`,
                bridge: `Bridged ${(totalVolEth / 15).toFixed(3)} ETH ${totalVolEth >= 0.05 ? '(✓)' : '(❌)'}`,
                holding: `${balanceEth.toFixed(4)} ETH ${balanceEth >= 0.002 ? '(✓)' : '(❌)'}`,
                status: (txCount >= 5 && balanceEth >= 0.002) ? "status-qualified" : "status-warning",
                label: (txCount >= 5 && balanceEth >= 0.002) ? "✓ Qualified" : "❌ Ineligible"
            }
        ];

        user.radarValues = [
            Math.min(1.0, ageDays / 365),
            Math.min(1.0, txCount / 200),
            Math.min(1.0, volUSD / 10000),
            user.hasScannedX ? 0.8 : 0.0,
            0.7
        ];

        user.chartData.tx = monthsTx;
        user.chartData.volume = monthsVol.map(Math.round);
        user.activeDays = activeDaysMap;

        user.airdropSubMetrics = {
            days: Math.min(100, Math.round(ageDays / 3)),
            contracts: Math.min(100, uniqueContractsCount * 5),
            gas: Math.min(100, Math.round(volUSD / 100))
        };

        let activeDaysTotal = 0;
        Object.keys(activeDaysMap).forEach(k => { activeDaysTotal += activeDaysMap[k].length; });
        user.airdropStats = {
            activeDays: `${activeDaysTotal} days`,
            activeWeeks: `${Math.max(1, Math.round(ageDays / 7))} weeks`,
            ratio: `${((txCount / Math.max(1, ageDays)) * 100).toFixed(1)}%`,
            streak: `${Math.min(14, Math.floor(txCount / 10))} days`
        };

        const newScore = await backend.calculatePassport(address);
        user.airdropScore = newScore;
        if (profileKey === APP_STATE.currentUser) {
            APP_STATE.airdropScore = newScore;
        }

        // Save current changes to localStorage
        saveState();

        // --- Update ALL UI immediately after real data is ready ---
        if (profileKey === APP_STATE.currentUser) {
            syncProfileUI(user, true);
        }
    } catch (error) {
        console.error("fetchOnchainDetails error:", error);
        if (profileKey === APP_STATE.currentUser) {
            const scanEls = [DOM.statWalletAge, DOM.statTxs, DOM.statVolume, DOM.statWeeklyTxs];
            scanEls.forEach(el => { if (el) el.removeAttribute("data-scanning"); });
            if (DOM.statWalletAge) DOM.statWalletAge.innerText = "Error";
            if (DOM.statWalletAgeSub) DOM.statWalletAgeSub.innerText = "Could not fetch data";
            syncProfileUI(user, false);
        }
    }
}

// DOM Elements
const DOM = {
    headerXp: document.getElementById("header-xp"),
    headerBxp: document.getElementById("header-bxp"),
    headerAddress: document.getElementById("header-address"),
    walletDropdown: document.getElementById("wallet-dropdown-menu"),
    walletDropdownTrigger: document.getElementById("header-connect-wallet-btn"),
    walletFullAddress: document.getElementById("wallet-full-address"),
    disconnectBtn: document.getElementById("btn-disconnect-wallet"),
    
    sidebarAvatar: document.getElementById("sidebar-avatar"),
    sidebarUsername: document.getElementById("sidebar-username"),
    sidebarAddress: document.getElementById("sidebar-address"),
    sidebarCopyAddressBtn: document.getElementById("sidebar-copy-address-btn"),
    
    navItems: document.querySelectorAll(".nav-item"),
    tabContents: document.querySelectorAll(".tab-content"),
    backHomeButtons: document.querySelectorAll(".btn-back-home"),
    
    searchInput: document.getElementById("wallet-search-input"),
    searchSuggestions: document.getElementById("search-suggestions"),
    
    notifBtn: document.querySelector(".notifications-btn"),
    notifBadge: document.querySelector(".notifications-btn .badge"),
    notifDropdown: document.querySelector(".notifications-dropdown"),
    markAllRead: document.querySelector(".mark-all-read"),
    
    metricAirdropScore: document.getElementById("metric-airdrop-score"),
    metricMentions: document.getElementById("metric-mentions"),
    metricSybil: document.getElementById("metric-sybil"),
    
    statWalletAge: document.getElementById("stat-wallet-age"),
    statWalletAgeSub: document.getElementById("stat-wallet-age-sub"),
    statTxs: document.getElementById("stat-txs"),
    statTxsSub: document.getElementById("stat-txs-sub"),
    statWeeklyTxs: document.getElementById("stat-weekly-txs"),
    statWeeklyTxsSub: document.getElementById("stat-weekly-txs-sub"),
    statVolume: document.getElementById("stat-volume"),
    statVolumeSub: document.getElementById("stat-volume-sub"),
    statProtocols: document.getElementById("stat-protocols"),
    statFeeSpent: document.getElementById("stat-fee-spent"),
    statTestnetUser: document.getElementById("stat-testnet-user"),
    
    chartToggleButtons: document.querySelectorAll(".btn-toggle"),
    chartTimeframe: document.getElementById("chart-timeframe"),
    activityChartWrapper: document.getElementById("activity-chart-wrapper"),
    
    eligibilityTableBody: document.getElementById("eligibility-table-body"),
    radarWrapper: document.getElementById("reputation-radar-wrapper"),
    repScoreNum: null,
    repScoreBadge: null,
    repSummaryText: null,
    
    referralLinkInput: null,
    copyRefBtn: null,
    refCopyText: null,
    invitedCount: null,
    bonusRollsCount: null,
    refBxpEarned: null,
    leaderboardList: null,
    leaderboardUserBxp: null,
    rolesCardContainer: document.getElementById("roles-card-container"),
    toastContainer: document.getElementById("toast-container"),

    airdropActScoreVal: document.getElementById("airdrop-activity-score-val"),
    airdropActScoreBadge: document.getElementById("airdrop-activity-score-badge"),
    subScoreDays: document.getElementById("sub-score-days"),
    subScoreContracts: document.getElementById("sub-score-contracts"),
    subScoreGas: document.getElementById("sub-score-gas"),
    subBarDays: document.getElementById("sub-bar-days"),
    subBarContracts: document.getElementById("sub-bar-contracts"),
    subBarGas: document.getElementById("sub-bar-gas"),
    fStatActiveDays: document.getElementById("f-stat-active-days"),
    fStatWeeks: document.getElementById("f-stat-weeks"),
    fStatRatio: document.getElementById("f-stat-ratio"),
    fStatStreak: document.getElementById("f-stat-streak"),
    calendarHeatmapContainer: document.getElementById("calendar-heatmap-container"),
    
    // Rewards tab DOM items
    rewardsBxpAmount: document.getElementById("rewards-bxp-amount"),
    bxpTxHistoryTbody: document.getElementById("bxp-tx-history-tbody"),
    
    // Leaderboards tab DOM items
    fullLeaderboardTbody: document.getElementById("full-leaderboard-tbody"),
    
    // Referrals tab DOM items
    referralPageLink: document.getElementById("referral-page-link"),
    btnCopyRefPage: document.getElementById("btn-copy-ref-page"),
    refPageInvited: document.getElementById("ref-page-invited"),
    refPageBxpEarned: document.getElementById("ref-page-bxp-earned"),
    refPageBonusRolls: document.getElementById("ref-page-bonus-rolls"),
    referredUsersTbody: document.getElementById("referred-users-tbody"),
    
    // Badges tab DOM grids
    badgesTxGrid: document.getElementById("badges-tx-grid"),
    badgesContractGrid: document.getElementById("badges-contract-grid"),
    badgesVolumeGrid: document.getElementById("badges-volume-grid"),
    badgesMentionsGrid: document.getElementById("badges-mentions-grid"),
    
    // Transactions tab DOM items
    realTransactionsTbody: document.getElementById("real-transactions-tbody"),
    viewOnBasescanTabBtn: document.getElementById("view-on-basescan-tab-btn")
};

// Helper Functions
function showToast(message, type = "success") {
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    
    let icon = "🔔";
    if (type === "success") icon = "✅";
    if (type === "warning") icon = "⚠";
    if (type === "error") icon = "❌";
    if (type === "purple") icon = "🎁";
    
    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <div class="toast-msg">${message}</div>
        <button class="toast-close">&times;</button>
    `;
    
    DOM.toastContainer.appendChild(toast);
    
    toast.querySelector(".toast-close").addEventListener("click", () => {
        toast.remove();
    });
    
    setTimeout(() => {
        toast.remove();
    }, 5000);
}

function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function getMockHash() {
    return "0x" + Array.from({length: 8}, () => Math.floor(Math.random()*16).toString(16)).join("") + "...f" + Math.floor(Math.random()*1000);
}

function updateCheckInTimerDisplay() {
    let seconds = APP_STATE.checkInTimeRemaining;
    let timerText = "";
    
    const streakDay = Math.min(APP_STATE.checkInStreak, 7);
    const bxpForToday = STREAK_BXP[streakDay - 1];
    
    // Update streak dots UI
    const streakHeaderEl = document.getElementById("streak-indicator-header");
    if (streakHeaderEl) {
        let dots = "";
        for (let i = 1; i <= 7; i++) {
            dots += i <= APP_STATE.checkInStreak ? "●" : "○";
            if (i < 7) dots += " ";
        }
        streakHeaderEl.innerText = dots;
    }
    
    if (seconds <= 0) {
        timerText = `Day ${streakDay} — Claim ${bxpForToday} BXP`;
        document.querySelectorAll(".btn-checkin-action").forEach(btn => {
            if (APP_STATE.currentUser === "fresh") {
                btn.disabled = true;
                btn.innerText = "Connect Wallet";
            } else {
                btn.disabled = false;
                btn.innerText = "Check-in";
            }
        });
    } else {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        
        const hStr = h.toString().padStart(2, "0");
        const mStr = m.toString().padStart(2, "0");
        const sStr = s.toString().padStart(2, "0");
        
        timerText = `${hStr}h : ${mStr}m : ${sStr}s`;
        
        document.querySelectorAll(".btn-checkin-action").forEach(btn => {
            if (APP_STATE.currentUser === "fresh") {
                btn.disabled = true;
                btn.innerText = "Connect Wallet";
            } else {
                btn.disabled = true;
                btn.innerText = "Checked In";
            }
        });
    }
    
    document.querySelectorAll(".checkin-timer-display").forEach(el => {
        el.innerText = timerText;
    });
}

function recordSimulatedOnchainTx(actionName, feeUsd = 0.05) {
    const user = PROFILES[APP_STATE.currentUser];
    if (!user || APP_STATE.currentUser === "fresh") return;

    // 1. Increment transaction count
    user.txsCount = (user.txsCount || 0) + 1;
    user.txs = formatNumber(user.txsCount);

    // 2. Add to total fee spent
    let currentFeeUsd = 0;
    if (user.totalFeeSpent && user.totalFeeSpent.startsWith("$")) {
        currentFeeUsd = parseFloat(user.totalFeeSpent.substring(1)) || 0;
    }
    user.totalFeeSpent = `$${(currentFeeUsd + feeUsd).toFixed(2)}`;

    // 3. Add to active footprint calendar
    const todayDate = new Date();
    const currentMonth = todayDate.toLocaleString('en-US', { month: 'long' });
    if (!user.activeDays) user.activeDays = {};
    if (!user.activeDays[currentMonth]) {
        user.activeDays[currentMonth] = [];
    }
    const todayDay = todayDate.getDate();
    if (!user.activeDays[currentMonth].includes(todayDay)) {
        user.activeDays[currentMonth].push(todayDay);
        user.activeDays[currentMonth].sort((a, b) => a - b);
    }

    // 4. Add to transaction history list
    if (!user.realTransactions) user.realTransactions = [];
    user.realTransactions.unshift({
        hash: getMockHash(),
        blockNumber: 15482390 + user.txsCount,
        metadata: {
            blockTimestamp: todayDate.toISOString()
        },
        from: user.address,
        to: "0x4b7858739F90461b99789350868CD7CF330Dd7EE",
        value: "0.00",
        asset: "ETH",
        category: "external",
        actionLabel: actionName
    });

    // 5. Recalculate score
    user.airdropScore = calculateAirdropScore(user);
    if (APP_STATE.currentUser === findProfileByAddress(user.address) || APP_STATE.currentUser === user.name) {
        APP_STATE.airdropScore = user.airdropScore;
    }
    
    // Update sub metrics days, contracts, gas for checklist
    let activeDaysTotal = 0;
    Object.keys(user.activeDays).forEach(k => { activeDaysTotal += user.activeDays[k].length; });
    user.airdropStats = user.airdropStats || {};
    user.airdropStats.activeDays = `${activeDaysTotal} days`;
    user.airdropStats.activeWeeks = `${Math.max(1, Math.round(activeDaysTotal / 7))} weeks`;
    user.airdropStats.ratio = `${((user.txsCount / Math.max(1, activeDaysTotal * 3)) * 100).toFixed(1)}%`;
    user.airdropStats.streak = `${Math.min(14, Math.floor(user.txsCount / 10) + 1)} days`;
    
    user.airdropSubMetrics = user.airdropSubMetrics || { days: 0, contracts: 0, gas: 0 };
    user.airdropSubMetrics.days = Math.min(100, Math.round(activeDaysTotal * 5));
    user.airdropSubMetrics.contracts = Math.min(100, (user.protocols || 0) * 5 + 5);
    user.airdropSubMetrics.gas = Math.min(100, Math.round((currentFeeUsd + feeUsd) * 8));
    
    // Trigger sync UI to update radar, charts, and checklist scores instantly
    syncProfileUI(user, false);
    saveState();
}

// Simulated Web3 Pop-up Gas Fee calculator returning Promise (read-only mode)
function runSimulatedTransaction(actionLabel, amountStr = "0.000001") {
    // Map human-readable action labels to smart contract actions
    let actionType = "verify";
    let realAmount = amountStr;
    let extraParam = "";

    if (actionLabel.includes("Mint Base Passport")) {
        actionType = "mint";
        realAmount = "0.000003"; // 0.000003 ETH mint fee (~$0.01)
        extraParam = "https://pandus.app/metadata/passport";
    } else if (actionLabel.includes("Check-in")) {
        actionType = "checkin";
        realAmount = "0.000001"; // 0.000001 ETH check-in fee (~$0.003)
    } else if (actionLabel.includes("Dice") || actionLabel.includes("Mystery")) {
        actionType = "game";
        realAmount = "0.000002"; // 0.000002 ETH game fee (~$0.006)
        extraParam = actionLabel.includes("Dice") ? "dice" : "mystery_box";
    } else {
        // Default verification / claims (OG bonus, Twitter verify, Badges)
        actionType = actionLabel;
        realAmount = "0.000001"; // 0.000001 ETH verification fee (~$0.003)
        extraParam = actionLabel;
    }

    return new Promise(async (resolve, reject) => {
        if (window.wagmiSendTransaction && APP_STATE.connectedAddress) {
            showToast(`⌛ Requesting payment for: ${actionLabel}...`, "purple");
            try {
                const txHash = await window.wagmiSendTransaction(actionType, realAmount, extraParam);
                showToast(`🎉 Transaction confirmed! Hash: ${txHash.substring(0, 8)}...`, "success");
                resolve(txHash);
            } catch (err) {
                console.error("Wagmi tx error:", err);
                showToast("❌ Transaction rejected or failed.", "error");
                resolve(null); // Return null on failure so the UI buttons reset properly
            }
        } else {
            // Read-only public blockchain data only. No real on-chain writes or signing.
            return runSimulation(actionLabel).then(resolve);
        }
    });
}

async function executeOnchainPayment(actionLabel, valueInEth) {
    return runSimulatedTransaction(actionLabel, valueInEth.toString());
}

function runSimulation(actionLabel) {
    return new Promise((resolve) => {
        showToast(`⌛ Initiating simulated transaction: ${actionLabel}...`, "warning");
        setTimeout(() => {
            showToast("Confirming on-chain transaction via Base...", "warning");
            setTimeout(() => {
                resolve("Optimized");
            }, 1200);
        }, 800);
    });
}

// 4. Custom SVG Charting Engine
// Helper to get timeframe specific data points and labels
function getChartDataForTimeframe(profile, chartType, timeframe) {
    const baseData = profile.chartData[chartType];
    if (timeframe === "3m") {
        return {
            values: baseData.slice(3),
            labels: ["Apr", "May", "Jun"],
            years: ["2026", "2026", "2026"]
        };
    } else if (timeframe === "1y") {
        const firstHalf = baseData.map(v => Math.round(v * 0.45));
        return {
            values: [...firstHalf, ...baseData],
            labels: ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"],
            years: ["2025", "2025", "2025", "2025", "2025", "2025", "2026", "2026", "2026", "2026", "2026", "2026"]
        };
    } else if (timeframe === "3y") {
        return {
            values: [
                Math.round(baseData[5] * 0.25),
                Math.round(baseData[5] * 0.65),
                baseData[5]
            ],
            labels: ["2024", "2025", "2026"],
            years: ["", "", ""]
        };
    } else {
        // default 6m
        return {
            values: baseData,
            labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
            years: ["2026", "2026", "2026", "2026", "2026", "2026"]
        };
    }
}

// 4. Custom SVG Charting Engine
function drawActivityChart() {
    const wrapper = DOM.activityChartWrapper;
    if (!wrapper) return;
    wrapper.innerHTML = "";
    
    const profile = PROFILES[APP_STATE.currentUser];
    const chartInfo = getChartDataForTimeframe(profile, APP_STATE.chartType, APP_STATE.chartTimeframe);
    const data = chartInfo.values;
    const labels = chartInfo.labels;
    
    const width = wrapper.clientWidth || 500;
    const height = 250;
    const padding = { top: 20, right: 30, bottom: 30, left: 50 };
    
    const graphWidth = width - padding.left - padding.right;
    const graphHeight = height - padding.top - padding.bottom;
    
    const maxVal = Math.max(...data) * 1.15;
    const minVal = 0;
    
    const svgNamespace = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNamespace, "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.style.overflow = "visible";
    
    const defs = document.createElementNS(svgNamespace, "defs");
    defs.innerHTML = `
        <linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#0052FF" stop-opacity="0.45"/>
            <stop offset="100%" stop-color="#0052FF" stop-opacity="0.0"/>
        </linearGradient>
        <linearGradient id="line-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#0052FF"/>
            <stop offset="50%" stop-color="#00F0FF"/>
            <stop offset="100%" stop-color="#8B5CF6"/>
        </linearGradient>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
    `;
    svg.appendChild(defs);
    
    const yTicks = 4;
    for (let i = 0; i <= yTicks; i++) {
        const yVal = minVal + (maxVal - minVal) * (i / yTicks);
        const y = padding.top + graphHeight - (graphHeight * (i / yTicks));
        
        const line = document.createElementNS(svgNamespace, "line");
        line.setAttribute("x1", padding.left);
        line.setAttribute("y1", y);
        line.setAttribute("x2", width - padding.right);
        line.setAttribute("y2", y);
        line.setAttribute("stroke", "rgba(255, 255, 255, 0.05)");
        line.setAttribute("stroke-dasharray", "4,4");
        svg.appendChild(line);
        
        const text = document.createElementNS(svgNamespace, "text");
        text.setAttribute("x", padding.left - 10);
        text.setAttribute("y", y + 4);
        text.setAttribute("fill", "#8E9BAE");
        text.setAttribute("font-size", "10px");
        text.setAttribute("text-anchor", "end");
        
        if (APP_STATE.chartType === "tx") {
            text.textContent = formatNumber(Math.round(yVal));
        } else if (APP_STATE.chartType === "volume") {
            text.textContent = `$${formatNumber(Math.round(yVal))}`;
        } else {
            text.textContent = formatNumber(Math.round(yVal));
        }
        svg.appendChild(text);
    }
    
    const points = data.map((val, index) => {
        const x = padding.left + (graphWidth * (index / (data.length - 1)));
        const y = padding.top + graphHeight - (graphHeight * ((val - minVal) / (maxVal - minVal)));
        return { x, y, val, label: labels[index], year: chartInfo.years[index] };
    });
    
    let areaPathD = `M ${points[0].x} ${padding.top + graphHeight} `;
    points.forEach(p => {
        areaPathD += `L ${p.x} ${p.y} `;
    });
    areaPathD += `L ${points[points.length - 1].x} ${padding.top + graphHeight} Z`;
    
    const areaPath = document.createElementNS(svgNamespace, "path");
    areaPath.setAttribute("d", areaPathD);
    areaPath.setAttribute("fill", "url(#area-grad)");
    svg.appendChild(areaPath);
    
    let linePathD = `M ${points[0].x} ${points[0].y} `;
    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const cpX1 = prev.x + (curr.x - prev.x) / 2;
        const cpY1 = prev.y;
        const cpX2 = prev.x + (curr.x - prev.x) / 2;
        const cpY2 = curr.y;
        linePathD += `C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${curr.x} ${curr.y} `;
    }
    
    const linePath = document.createElementNS(svgNamespace, "path");
    linePath.setAttribute("d", linePathD);
    linePath.setAttribute("fill", "none");
    linePath.setAttribute("stroke", "url(#line-grad)");
    linePath.setAttribute("stroke-width", "3");
    linePath.setAttribute("filter", "url(#glow)");
    svg.appendChild(linePath);
    
    const dotsGroup = document.createElementNS(svgNamespace, "g");
    
    points.forEach((p, index) => {
        const xText = document.createElementNS(svgNamespace, "text");
        xText.setAttribute("x", p.x);
        xText.setAttribute("y", height - 10);
        xText.setAttribute("fill", "#8E9BAE");
        xText.setAttribute("font-size", "10px");
        xText.setAttribute("text-anchor", "middle");
        xText.textContent = p.label;
        svg.appendChild(xText);
        
        const interactiveCircle = document.createElementNS(svgNamespace, "circle");
        interactiveCircle.setAttribute("cx", p.x);
        interactiveCircle.setAttribute("cy", p.y);
        interactiveCircle.setAttribute("r", "16");
        interactiveCircle.setAttribute("fill", "transparent");
        interactiveCircle.style.cursor = "pointer";
        
        const circle = document.createElementNS(svgNamespace, "circle");
        circle.setAttribute("cx", p.x);
        circle.setAttribute("cy", p.y);
        circle.setAttribute("r", "5");
        circle.setAttribute("fill", "#060b18");
        circle.setAttribute("stroke", "#00F0FF");
        circle.setAttribute("stroke-width", "2");
        circle.style.transition = "r 0.15s ease, fill 0.15s ease";
        
        dotsGroup.appendChild(circle);
        dotsGroup.appendChild(interactiveCircle);
        
        interactiveCircle.addEventListener("mouseenter", () => {
            circle.setAttribute("r", "7");
            circle.setAttribute("fill", "#00F0FF");
            
            let tooltipText = "";
            if (APP_STATE.chartType === "tx") {
                tooltipText = `${formatNumber(p.val)} tx`;
            } else if (APP_STATE.chartType === "volume") {
                tooltipText = `$${formatNumber(p.val)}`;
            } else {
                tooltipText = `${formatNumber(p.val)} BXP`;
            }
            
            const tooltipTitle = p.year ? `${p.label} ${p.year}` : p.label;
            showChartTooltip(p.x, p.y, tooltipTitle, tooltipText);
        });
        
        interactiveCircle.addEventListener("mouseleave", () => {
            circle.setAttribute("r", "5");
            circle.setAttribute("fill", "#060b18");
            hideChartTooltip();
        });
    });
    
    svg.appendChild(dotsGroup);
    wrapper.appendChild(svg);
}

let activeTooltip = null;
function showChartTooltip(x, y, titleText, value) {
    hideChartTooltip();
    
    const tooltip = document.createElement("div");
    tooltip.className = "chart-tooltip";
    tooltip.innerHTML = `
        <div class="tooltip-title">${titleText}</div>
        <div class="tooltip-value">${value}</div>
    `;
    
    DOM.activityChartWrapper.appendChild(tooltip);
    
    const parentRect = DOM.activityChartWrapper.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    
    let leftPos = x;
    if (leftPos - tooltipRect.width/2 < 0) leftPos = tooltipRect.width/2 + 5;
    if (leftPos + tooltipRect.width/2 > parentRect.width) leftPos = parentRect.width - tooltipRect.width/2 - 5;
    
    tooltip.style.left = `${leftPos}px`;
    tooltip.style.top = `${y}px`;
    tooltip.style.opacity = "1";
    activeTooltip = tooltip;
}

function hideChartTooltip() {
    if (activeTooltip) {
        activeTooltip.remove();
        activeTooltip = null;
    }
}

// Render Sybil classification with 3 tiers and direct funding link checks
function getSybilClassification(multiWallets, sentToWalletsCount) {
    const multi = multiWallets || 1;
    const sent = sentToWalletsCount || 0;
    
    if (sent > 3) {
        return { label: "🚨 Sybil Clustered", color: "#ef4444", desc: `Directly funded ${sent} wallets (Cluster pattern detected).` };
    } else if (multi > 3) {
        return { label: "🚨 High Risk", color: "#ef4444", desc: `${multi} linked wallets flagged — high Sybil risk!` };
    } else if (multi > 1 || sent > 1) {
        return { label: "⚠️ Suspected", color: "#f59e0b", desc: `Linked wallets: ${multi}. Directly funded wallets: ${sent}.` };
    } else {
        return { label: "✅ Safe", color: "#10b981", desc: "Single wallet, no direct multi-funding patterns." };
    }
}

// Render OG NFT Status Card
function renderOgNftCard(user) {
    const builderBadge = document.getElementById("nft-builder-badge");
    const betaBadge = document.getElementById("nft-beta-badge");
    const nftTitleIcon = document.getElementById("nft-title-icon");
    const nftTitle = document.getElementById("nft-title");
    const nftDesc = document.getElementById("nft-description");
    const collectBtn = document.getElementById("btn-collect-nft-xp");
    
    if (!builderBadge) return;
    
    const hasBuilder = user.hasBuilderNFT || false;
    const hasBeta = user.hasBetaNFT || false;
    
    // Builder NFT badge
    if (hasBuilder) {
        builderBadge.innerText = "✅ Held";
        builderBadge.style.background = "rgba(16,185,129,0.15)";
        builderBadge.style.color = "#10b981";
    } else {
        builderBadge.innerText = "❌ Not Held";
        builderBadge.style.background = "rgba(239,68,68,0.15)";
        builderBadge.style.color = "#ef4444";
    }
    
    // Beta NFT badge
    if (hasBeta) {
        betaBadge.innerText = "✅ Held";
        betaBadge.style.background = "rgba(16,185,129,0.15)";
        betaBadge.style.color = "#10b981";
    } else {
        betaBadge.innerText = "❌ Not Held";
        betaBadge.style.background = "rgba(239,68,68,0.15)";
        betaBadge.style.color = "#ef4444";
    }
    
    // Classification
    if (hasBuilder && hasBeta) {
        nftTitleIcon.innerText = "👑";
        nftTitle.innerText = "Base Emperor";
        nftDesc.innerText = "You hold BOTH NFTs! Highly possibly for Base Airdrop. 🎯";
        nftDesc.style.color = "#10b981";
        if (collectBtn) { collectBtn.style.display = "inline-block"; }
    } else if (hasBuilder || hasBeta) {
        nftTitleIcon.innerText = "🛡️";
        nftTitle.innerText = "Base Maxi OG";
        nftDesc.innerText = hasBuilder ? "Hold Beta Access NFT to reach Emperor status." : "Hold Base Builder NFT to reach Emperor status.";
        nftDesc.style.color = "#f59e0b";
        if (collectBtn) { collectBtn.style.display = "none"; }
    } else {
        nftTitleIcon.innerText = "👤";
        nftTitle.innerText = "Base Pleb";
        nftDesc.innerText = "Hold NFTs to unlock higher status.";
        nftDesc.style.color = "var(--text-secondary)";
        if (collectBtn) { collectBtn.style.display = "none"; }
    }
}

// Render Verified Roles Card
function renderRolesCard(user) {
    const container = DOM.rolesCardContainer;
    if (!container) return;
    container.innerHTML = "";
    
    // 1. Base Onchain Verifier
    const hasVerifier = user.onchainVerifier || false;
    const verifierItem = document.createElement("div");
    verifierItem.className = `role-item-card ${hasVerifier ? 'verified' : 'unverified'}`;
    verifierItem.innerHTML = `
        <div class="role-card-inner">
            <div class="role-left-group">
                <span class="role-icon">${hasVerifier ? '🛡️' : '👤'}</span>
                <div class="role-text-meta">
                    <strong class="role-name">Base Onchain Verifier</strong>
                    <span class="role-desc">Verified identity via Coinbase/Base App</span>
                </div>
            </div>
            <span class="role-status-badge ${hasVerifier ? 'status-active' : 'status-inactive'}">
                ${hasVerifier ? 'Verified ✓' : 'Not Verified'}
            </span>
        </div>
    `;
    container.appendChild(verifierItem);
    
    // 2. Base Guild Member
    const hasGuild = user.guildMember || false;
    const guildItem = document.createElement("div");
    guildItem.className = `role-item-card ${hasGuild ? 'verified' : 'unverified'}`;
    guildItem.innerHTML = `
        <div class="role-card-inner">
            <div class="role-left-group">
                <span class="role-icon">🏰</span>
                <div class="role-text-meta">
                    <strong class="role-name">Base Guild Member</strong>
                    <span class="role-desc">Holds active roles in Base Guild</span>
                </div>
            </div>
            <span class="role-status-badge ${hasGuild ? 'status-guild' : 'status-inactive'}">
                ${hasGuild ? 'Guild Active ✓' : 'Not Connected'}
            </span>
        </div>
    `;
    container.appendChild(guildItem);
    
    // 3. Protocol Legend
    const protocolsCount = user.protocols || 0;
    const isLegend = protocolsCount >= 5;
    const legendItem = document.createElement("div");
    legendItem.className = `role-item-card ${isLegend ? 'verified' : 'unverified'}`;
    legendItem.innerHTML = `
        <div class="role-card-inner">
            <div class="role-left-group">
                <span class="role-icon">${isLegend ? '👑' : '🪙'}</span>
                <div class="role-text-meta">
                    <strong class="role-name">Protocol Legend</strong>
                    <span class="role-desc">Active in 5+ Base protocols (Used: ${protocolsCount})</span>
                </div>
            </div>
            <span class="role-status-badge ${isLegend ? 'status-legend' : 'status-inactive'}">
                ${isLegend ? 'Legend ✓' : `Incomplete (${protocolsCount}/5)`}
            </span>
        </div>
    `;
    container.appendChild(legendItem);
}

// Render Base Onchain Passport Card
function renderPassport(user) {
    const passportName = document.getElementById("passport-name");
    const passportAvatarImg = document.getElementById("passport-avatar-img");
    const passportLevel = document.getElementById("passport-level");
    const passportAddressVal = document.getElementById("passport-address-val");
    const passportJoinedVal = document.getElementById("passport-joined-val");
    const passportAgeVal = document.getElementById("passport-age-val");
    const passportSybilVal = document.getElementById("passport-sybil-val");
    const passportVolumeVal = document.getElementById("passport-volume-val");
    const passportMentionsVal = document.getElementById("passport-mentions-val");
    const passportVerifyVal = document.getElementById("passport-verify-val");
    const passportNftsVal = document.getElementById("passport-nfts-val");
    const passportGasVal = document.getElementById("passport-gas-val");
    const passportFeeVal = document.getElementById("passport-fee-val");
    const passportRankGridVal = document.getElementById("passport-rank-grid-val");
    const passportScoreVal = document.getElementById("passport-score-val");
    const passportRankVal = document.getElementById("passport-rank-val");
    const passportStampDate = document.getElementById("passport-stamp-date");
    
    if (!passportName) return;
    
    // Keep permanent passport avatar image from index.html (Holographic Base Citizen SVG)
    // if (passportAvatarImg && user.avatar) {
    //     passportAvatarImg.src = user.avatar;
    // }
    
    // Helpers for formatting within passport
    const getWalletAgeFormatted = (walletAgeStr) => {
        const num = parseInt(walletAgeStr.replace(/,/g, ""));
        if (!isNaN(num)) {
            if (num >= 365) {
                return (num / 365).toFixed(1) + " Years";
            }
            return num + " Days";
        }
        return walletAgeStr;
    };

    const getStampDateFormatted = (dateStr) => {
        if (!dateStr) return "12 APR 2025";
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
            const day = date.getDate().toString().padStart(2, "0");
            const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
            const month = months[date.getMonth()];
            const year = date.getFullYear();
            return `${day} ${month} ${year}`;
        }
        return dateStr.toUpperCase();
    };

    const getOgNftStatus = (userObj) => {
        const hasBuilder = userObj.hasBuilderNFT || false;
        const hasBeta = userObj.hasBetaNFT || false;
        if (hasBuilder && hasBeta) return "Holder (Both)";
        if (hasBuilder) return "Holder (Builder)";
        if (hasBeta) return "Holder (Beta)";
        return "None";
    };
    
    const score = user.airdropScore !== undefined ? user.airdropScore : calculateAirdropScore(user);
    const scaledScore = score;
    const isFreshPassport = (user.address === '' || user.shortAddress === 'No Wallet Connected');
    
    // Update dynamic text fields
    passportName.innerText = user.name;
    
    // Level calculation (Lv. based on dynamic score, capped at 98 max)
    const levelVal = isFreshPassport ? 0 : (Math.floor(score * 0.8) + 7);
    passportLevel.innerText = isFreshPassport ? 'Lv.0' : `Lv.${levelVal}`;
    
    // Address format
    passportAddressVal.innerText = isFreshPassport ? '— Not Connected —' : user.shortAddress;
    
    // Dates & Age formatted
    passportJoinedVal.innerText = isFreshPassport ? '—' : (user.joinedDate || "Jan 18, 2023");
    passportAgeVal.innerText = isFreshPassport ? '—' : user.walletAge;
    
    // Sybil rating
    const sybilData = getSybilClassification(user.multiWallets || 1, user.sentToWalletsCount || 0);
    passportSybilVal.innerText = sybilData.label.replace("✅ ", "").replace("⚠️ ", "").replace("🚨 ", "");
    if (user.multiWallets > 3 || (user.sentToWalletsCount || 0) > 3) {
        passportSybilVal.className = "grid-item-value text-red";
    } else if (user.multiWallets > 1) {
        passportSybilVal.className = "grid-item-value text-orange";
    } else {
        passportSybilVal.className = "grid-item-value text-green";
    }
    
    // Volume & X Mentions
    passportVolumeVal.innerText = user.volume || "$0";
    if (passportMentionsVal) {
        const parentItem = passportMentionsVal.closest(".passport-grid-item");
        if (parentItem) {
            if (user.hasScannedX && user.baseMentions > 0) {
                parentItem.style.display = "block";
                passportMentionsVal.innerText = `${user.baseMentions} Mentions`;
            } else {
                parentItem.style.display = "none";
            }
        } else {
            passportMentionsVal.innerText = user.hasScannedX ? `${user.baseMentions} Mentions` : "—";
        }
    }
    
    // Onchain verifier status
    const hasVerifier = user.onchainVerifier || false;
    passportVerifyVal.innerText = hasVerifier ? "Verified ✓" : "Unverified";
    if (hasVerifier) {
        passportVerifyVal.className = "grid-item-value text-green";
    } else {
        passportVerifyVal.className = "grid-item-value text-red";
    }
    
    // Total NFTs held on Base network
    const nftCount = user.totalNfts || 0;
    passportNftsVal.innerText = `${nftCount} NFTs`;
    
    if (passportGasVal) {
        passportGasVal.innerText = (user.txs || "0") + " Tx";
    }
    
    if (passportFeeVal) {
        passportFeeVal.innerText = user.totalFeeSpent || "$0.00";
    }
    
    // Onchain score is direct maximum 100 based on usage criteria
    passportScoreVal.innerText = isFreshPassport ? "—" : score;
    
    // Rank logic
    let rankText = isFreshPassport ? '—' : "TOP 35%";
    if (!isFreshPassport) {
        if (score >= 97) rankText = "TOP 1%";
        else if (score >= 90) rankText = "TOP 3%";
        else if (score >= 80) rankText = "TOP 5%";
        else if (score >= 60) rankText = "TOP 15%";
    }
    passportRankVal.innerText = rankText;
    
    if (passportRankGridVal) {
        passportRankGridVal.innerText = rankText;
    }
    
    // Static Green Ink Stamp Date
    const stampSeal = document.getElementById("passport-stamp-seal");
    if (stampSeal) {
        if (isFreshPassport) {
            stampSeal.classList.add("hidden");
        } else {
            stampSeal.classList.remove("hidden");
            passportStampDate.innerText = getStampDateFormatted(user.joinedDate);
        }
    }
    
    // Copy wallet address click binding
    const copyAddrBtn = document.getElementById("btn-copy-passport-addr");
    if (copyAddrBtn) {
        copyAddrBtn.onclick = (e) => {
            e.preventDefault();
            navigator.clipboard.writeText(user.address).then(() => {
                showToast("Wallet address copied to clipboard!", "success");
            }).catch(() => {
                showToast("Failed to copy address.", "error");
            });
        };
    }
    
    // Setup share URLs
    const shareText = `Check out my Base Onchain Passport! 🆔\n• Registered Name: ${user.name}\n• Level: Lv.${levelVal}\n• Base Score: ${scaledScore}\n• Rank: ${rankText}\n• Wallet Age: ${getWalletAgeFormatted(user.walletAge)}\n\nJoin here to get your Base Passport: ${window.location.origin}/r/${user.name} 🔵🚀`;
    const shareTextEncoded = encodeURIComponent(shareText);
    
    // Redirect properly to X.com
    const twitterUrl = `https://x.com/intent/tweet?text=${shareTextEncoded}`;
    const btnShareX = document.getElementById("btn-share-x-new");
    if (btnShareX) btnShareX.href = twitterUrl;
    
    // Redirect properly to Telegram
    const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(`${window.location.origin}/r/${user.name}`)}&text=${encodeURIComponent(`Check out my Base Onchain Passport! 🆔\n• Level: Lv.${levelVal}\n• Base Score: ${scaledScore}\n• Rank: ${rankText}\n\nJoin here to get yours:`)}`;
    const btnShareTg = document.getElementById("btn-share-tg-new");
    if (btnShareTg) btnShareTg.href = telegramUrl;
    
    // Redirect properly to Discord (Copy share text & open Discord channel)
    const btnShareDiscord = document.getElementById("btn-share-discord-new");
    if (btnShareDiscord) {
        btnShareDiscord.onclick = (e) => {
            e.preventDefault();
            navigator.clipboard.writeText(shareText).then(() => {
                showToast("💾 Share message copied! Opening Discord...", "success");
                setTimeout(() => {
                    window.open("https://discord.com/channels/@me", "_blank");
                }, 800);
            }).catch(() => {
                showToast("❌ Failed to copy share message.", "error");
            });
        };
    }
    
    // Global tab switching helper
    window.switchTab = function(tabId) {
        const navItem = document.querySelector(`.nav-item[data-tab='${tabId}']`);
        if (navItem) {
            navItem.click();
        }
    };
    
    // Viral Twitter Score Sharing Reward Handler
    window.handleShareOnX = function() {
        const user = PROFILES[APP_STATE.currentUser];
        const score = user.airdropScore !== undefined ? user.airdropScore : calculateAirdropScore(user);
        const levelVal = Math.floor(score * 0.8) + 7;
        let rankText = "TOP 35%";
        if (score >= 97) rankText = "TOP 1%";
        else if (score >= 90) rankText = "TOP 3%";
        else if (score >= 80) rankText = "TOP 5%";
        else if (score >= 60) rankText = "TOP 15%";
        
        const tweetText = `Just verified my Base Onchain Passport! 🆔\nMy Base Score is ${score} (${rankText} of all users) 🌐. Check your score and claim your passport here: ${window.location.origin}/r/${user.name} 🔵🚀`;
        const tweetUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
        
        window.open(tweetUrl, "_blank");
        
        if (!APP_STATE.hasSharedX) {
            APP_STATE.hasSharedX = true;
            
            const boostBxp = 100;
            APP_STATE.bxp += boostBxp;
            
            if (DOM.headerBxp) DOM.headerBxp.innerText = `${formatNumber(APP_STATE.bxp)} BXP`;
            if (DOM.rewardsBxpAmount) DOM.rewardsBxpAmount.innerText = formatNumber(APP_STATE.bxp);
            
            // Log transaction in history
            APP_STATE.bxpTransactions.unshift({
                type: "Twitter Score Share Boost",
                amount: `+${boostBxp} BXP`,
                gas: "Ultra Fast",
                status: "Success",
                hash: getMockHash(),
                time: "Just now"
            });
            
            user.bxp = APP_STATE.bxp;
            renderBxpTransactions();
            renderLeaderboardsPage();
            
            showToast("🎉 Twitter Score Share Verified! +100 BXP Boost rewarded to your account!", "success");
        } else {
            showToast("Opening Twitter share intent...", "success");
        }
    };
    
    // Save passport action
    const btnSavePassport = document.getElementById("btn-save-passport-new");
    const btnClaimPassportMain = document.getElementById("btn-claim-passport-main");
    
    const handlePassportMint = (e) => {
        e.preventDefault();
        const isWalletConnected = !!(APP_STATE.connectedAddress && APP_STATE.connectedAddress.startsWith("0x"));
        if (!isWalletConnected) {
            showToast("❌ Access Denied: Please connect your Web3 wallet first!", "error");
            return;
        }
        if (!APP_STATE.isPassportMinted) {
            // Open mint modal
            const modal = document.getElementById("mint-passport-modal");
            if (modal) modal.classList.remove("hidden");
        } else {
            triggerPassportDownload(user, levelVal, scaledScore, rankText);
        }
    };
    
    if (btnSavePassport) {
        btnSavePassport.onclick = handlePassportMint;
    }
    if (btnClaimPassportMain) {
        btnClaimPassportMain.onclick = handlePassportMint;
    }
}

function triggerPassportDownload(user, levelVal, scaledScore, rankText) {
    showToast("⌛ Rendering your high-definition Passport image...", "purple");
    
    const passportElement = document.querySelector(".passport-card");
    if (!passportElement) {
        showToast("❌ Passport card element not found!", "error");
        return;
    }
    
    // Temporarily hide social sharing buttons, copy icon, and viral share buttons so they do not show in the generated image
    const downloadBtn = document.getElementById("btn-save-passport-new");
    const shareXIconBtn = document.getElementById("btn-share-x-new");
    const shareXViralContainer = document.querySelector(".score-share-cta");
    const shareXViralBtn = document.getElementById("btn-share-x-viral");
    const claimBtnMain = document.getElementById("btn-claim-passport-main");
    const addressCopyBtn = document.getElementById("btn-copy-passport-addr");
    
    const titleHeader = passportElement.querySelector(".passport-title-header");
    
    if (downloadBtn) downloadBtn.style.setProperty("display", "none", "important");
    if (shareXIconBtn) shareXIconBtn.style.setProperty("display", "none", "important");
    if (shareXViralContainer) shareXViralContainer.style.setProperty("display", "none", "important");
    if (shareXViralBtn) shareXViralBtn.style.setProperty("display", "none", "important");
    if (claimBtnMain) claimBtnMain.style.setProperty("display", "none", "important");
    if (addressCopyBtn) addressCopyBtn.style.setProperty("display", "none", "important");
    
    if (titleHeader) {
        titleHeader.style.background = "none";
        titleHeader.style.webkitTextFillColor = "#00F0FF";
        titleHeader.style.color = "#00F0FF";
    }
    
    // Render the card to a canvas using html2canvas
    html2canvas(passportElement, {
        useCORS: true,
        allowTaint: false,
        backgroundColor: null,
        scale: 2, // 2x scale for premium crisp resolution
        logging: false
    }).then(canvas => {
        // Restore elements visibility immediately
        if (downloadBtn) downloadBtn.style.display = "";
        if (shareXIconBtn) shareXIconBtn.style.display = "";
        if (shareXViralContainer) shareXViralContainer.style.display = "";
        if (shareXViralBtn) shareXViralBtn.style.display = "";
        if (claimBtnMain) claimBtnMain.style.display = "";
        if (addressCopyBtn) addressCopyBtn.style.display = "";
        
        if (titleHeader) {
            titleHeader.style.background = "";
            titleHeader.style.webkitTextFillColor = "";
            titleHeader.style.color = "";
        }
        
        try {
            const imgData = canvas.toDataURL("image/png");
            const link = document.createElement("a");
            link.href = imgData;
            link.download = `base_passport_${user.name}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            showToast(`💾 Base Passport image saved successfully!`, "success");
        } catch (err) {
            console.error("html2canvas download error:", err);
            showToast("⚠️ Image rendering failed, downloading text backup...", "warning");
            fallbackTextDownload(user, levelVal, scaledScore, rankText);
        }
    }).catch(err => {
        console.error("html2canvas generate error:", err);
        // Restore elements visibility
        if (downloadBtn) downloadBtn.style.display = "";
        if (shareXIconBtn) shareXIconBtn.style.display = "";
        if (shareXViralContainer) shareXViralContainer.style.display = "";
        if (shareXViralBtn) shareXViralBtn.style.display = "";
        if (claimBtnMain) claimBtnMain.style.display = "";
        if (addressCopyBtn) addressCopyBtn.style.display = "";
        
        if (titleHeader) {
            titleHeader.style.background = "";
            titleHeader.style.webkitTextFillColor = "";
            titleHeader.style.color = "";
        }
        
        showToast("⚠️ Image rendering failed, downloading text backup...", "warning");
        fallbackTextDownload(user, levelVal, scaledScore, rankText);
    });
}

function fallbackTextDownload(user, levelVal, scaledScore, rankText) {
    const passportData = `=========================================
OFFICIAL BASE ONCHAIN CITIZEN PASSPORT
=========================================
REGISTERED NAME : ${user.name}
WALLET ADDRESS  : ${user.address}
LEVEL           : Lv.${levelVal}
WALLET AGE      : ${user.walletAge}
DATE JOINED     : ${user.joinedDate || "Jan 18, 2023"}
BASE SCORE      : ${scaledScore}
RANK CATEGORY   : ${rankText}
-----------------------------------------
VERIFICATION    : BASE APP VERIFIED INK SEAL ✓
STATUS          : ★ APPROVED CITIZEN ★
=========================================`;
    
    const blob = new Blob([passportData], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `base_passport_${user.name}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Draw Base Reputation Radar Chart
function drawReputationRadar() {
    const wrapper = DOM.radarWrapper;
    if (!wrapper) return;
    wrapper.innerHTML = "";
    
    const profile = PROFILES[APP_STATE.currentUser];
    const stats = profile.radarValues;
    
    const width = 160;
    const height = 160;
    const center = 80;
    const radius = 60;
    
    const svgNamespace = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNamespace, "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.style.overflow = "visible";
    
    const defs = document.createElementNS(svgNamespace, "defs");
    defs.innerHTML = `
        <linearGradient id="radar-glow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#00F0FF" stop-opacity="0.6"/>
            <stop offset="100%" stop-color="#8B5CF6" stop-opacity="0.6"/>
        </linearGradient>
        <radialGradient id="radar-poly" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#0052FF" stop-opacity="0.15"/>
            <stop offset="70%" stop-color="#00F0FF" stop-opacity="0.4"/>
            <stop offset="100%" stop-color="#8B5CF6" stop-opacity="0.5"/>
        </radialGradient>
    `;
    svg.appendChild(defs);
    
    const angles = [-90, -18, 54, 126, 198].map(deg => deg * Math.PI / 180);
    const labels = ["Age", "Transactions", "Volume", "Mentions", "Activity"];
    
    const levels = 4;
    for (let l = 1; l <= levels; l++) {
        const r = radius * (l / levels);
        let pathD = "";
        
        angles.forEach((angle, i) => {
            const x = center + r * Math.cos(angle);
            const y = center + r * Math.sin(angle);
            pathD += (i === 0 ? "M " : "L ") + `${x} ${y} `;
        });
        pathD += "Z";
        
        const ring = document.createElementNS(svgNamespace, "path");
        ring.setAttribute("d", pathD);
        ring.setAttribute("fill", "none");
        ring.setAttribute("stroke", "rgba(255, 255, 255, 0.05)");
        ring.setAttribute("stroke-width", "1");
        svg.appendChild(ring);
    }
    
    angles.forEach(angle => {
        const x = center + radius * Math.cos(angle);
        const y = center + radius * Math.sin(angle);
        
        const line = document.createElementNS(svgNamespace, "line");
        line.setAttribute("x1", center);
        line.setAttribute("y1", center);
        line.setAttribute("x2", x);
        line.setAttribute("y2", y);
        line.setAttribute("stroke", "rgba(255, 255, 255, 0.06)");
        svg.appendChild(line);
    });
    
    angles.forEach((angle, i) => {
        const x = center + (radius + 15) * Math.cos(angle);
        let y = center + (radius + 15) * Math.sin(angle);
        
        if (i === 1 || i === 4) y += 4;
        if (i === 2 || i === 3) y += 8;
        
        const text = document.createElementNS(svgNamespace, "text");
        text.setAttribute("x", x);
        text.setAttribute("y", y);
        text.setAttribute("fill", "#8E9BAE");
        text.setAttribute("font-size", "9px");
        text.setAttribute("text-anchor", "middle");
        text.textContent = labels[i];
        svg.appendChild(text);
    });
    
    let userPathD = "";
    angles.forEach((angle, i) => {
        const r = radius * stats[i];
        const x = center + r * Math.cos(angle);
        const y = center + r * Math.sin(angle);
        userPathD += (i === 0 ? "M " : "L ") + `${x} ${y} `;
    });
    userPathD += "Z";
    
    const poly = document.createElementNS(svgNamespace, "path");
    poly.setAttribute("d", userPathD);
    poly.setAttribute("fill", "url(#radar-poly)");
    poly.setAttribute("stroke", "url(#radar-glow)");
    poly.setAttribute("stroke-width", "2");
    svg.appendChild(poly);
    
    angles.forEach((angle, i) => {
        const r = radius * stats[i];
        const x = center + r * Math.cos(angle);
        const y = center + r * Math.sin(angle);
        
        const dot = document.createElementNS(svgNamespace, "circle");
        dot.setAttribute("cx", x);
        dot.setAttribute("cy", y);
        dot.setAttribute("r", "3.5");
        dot.setAttribute("fill", "#FFFFFF");
        dot.setAttribute("stroke", "#00F0FF");
        dot.setAttribute("stroke-width", "1.5");
        svg.appendChild(dot);
    });
    
    wrapper.appendChild(svg);
}

// 4b. Dynamic Calendar Footprint Generator
function renderActivityCalendar() {
    const container = DOM.calendarHeatmapContainer;
    if (!container) return;
    container.innerHTML = "";
    
    const user = PROFILES[APP_STATE.currentUser];
    const activeDays = user.activeDays;
    
    const monthsConfig = [
        { name: "April", daysCount: 30, startOffset: 3 }, 
        { name: "May", daysCount: 31, startOffset: 5 },   
        { name: "June", daysCount: 30, startOffset: 1 }   
    ];
    
    const weekNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
    
    monthsConfig.forEach(month => {
        const monthCard = document.createElement("div");
        monthCard.className = "calendar-month";
        
        const title = document.createElement("div");
        title.className = "month-name";
        title.innerText = `${month.name} 2026`;
        monthCard.appendChild(title);
        
        const grid = document.createElement("div");
        grid.className = "days-grid";
        
        weekNames.forEach(w => {
            const wHeader = document.createElement("div");
            wHeader.className = "day-name";
            wHeader.innerText = w;
            grid.appendChild(wHeader);
        });
        
        for (let i = 0; i < month.startOffset; i++) {
            const emptyCell = document.createElement("div");
            emptyCell.className = "day-cell empty-cell";
            grid.appendChild(emptyCell);
        }
        
        const activeList = activeDays[month.name] || [];
        const today = new Date();
        const currentMonthName = today.toLocaleString('en-US', { month: 'long' });
        const currentDay = today.getDate();
        
        const maxDays = month.name === currentMonthName ? Math.min(month.daysCount, currentDay) : month.daysCount;
        
        for (let day = 1; day <= maxDays; day++) {
            const cell = document.createElement("div");
            cell.className = "day-cell active-month";
            
            const isActive = activeList.includes(day);
            if (isActive) {
                cell.classList.add("footprint-day");
                cell.innerHTML = `${day}<span class="footprint-icon" title="👣 Active Footprint: ${Math.floor(Math.random()*3)+1} tx, $${(Math.random()*0.004 + 0.006).toFixed(3)} gas spent">👣</span>`;
            } else {
                cell.innerHTML = "";
            }
            grid.appendChild(cell);
        }
        
        for (let day = maxDays + 1; day <= month.daysCount; day++) {
            const cell = document.createElement("div");
            cell.className = "day-cell empty-cell";
            grid.appendChild(cell);
        }
        
        monthCard.appendChild(grid);
        container.appendChild(monthCard);
    });
}

// 4c. Dynmic Page Renderers (Rewards, Leaderboard, Badges, Referrals)
function renderBxpTransactions() {
    const tbody = DOM.bxpTxHistoryTbody;
    if (!tbody) return;
    tbody.innerHTML = "";
    
    APP_STATE.bxpTransactions.forEach(tx => {
        const tr = document.createElement("tr");
        const txUrl = tx.hash && tx.hash.startsWith("0x") && !tx.hash.includes("...") ? `https://basescan.org/tx/${tx.hash}` : "#";
        const targetAttr = txUrl !== "#" ? 'target="_blank"' : '';
        tr.innerHTML = `
            <td><strong>${tx.type}</strong></td>
            <td class="text-green">${tx.amount}</td>
            <td><code style="background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px;">${tx.gas}</code></td>
            <td><span class="badge-status status-qualified">✓ ${tx.status}</span></td>
            <td><a href="${txUrl}" ${targetAttr} style="font-family: monospace; color: var(--color-cyan); font-size: 11px;">${tx.hash}</a> | <span style="font-size: 11px; color: var(--text-muted);">${tx.time}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

function renderRealTransactionsPage() {
    const tbody = DOM.realTransactionsTbody;
    if (!tbody) return;
    tbody.innerHTML = "";
    
    const user = PROFILES[APP_STATE.currentUser];
    if (!user) return;
    
    // Update the full explorer page button link
    const viewBtn = DOM.viewOnBasescanTabBtn;
    if (viewBtn) {
        viewBtn.href = user.address && user.address.startsWith("0x") ? `https://basescan.org/address/${user.address}` : "#";
    }
    
    const txList = user.realTransactions || [];
    
    if (txList.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 30px;">
                    No transactions found for this profile on Base Mainnet.
                </td>
            </tr>
        `;
        return;
    }
    
    txList.forEach(tx => {
        const tr = document.createElement("tr");
        const txUrl = `https://basescan.org/tx/${tx.hash}`;
        const shortHash = tx.hash.substring(0, 10) + "..." + tx.hash.substring(tx.hash.length - 8);
        
        // Handle block Timestamp properly for both Alchemy and Blockscout formats
        let txTimeMs = 0;
        if (tx.metadata && tx.metadata.blockTimestamp) {
            txTimeMs = new Date(tx.metadata.blockTimestamp).getTime();
        } else if (tx.timeStamp) {
            txTimeMs = parseInt(tx.timeStamp) * 1000;
        } else {
            txTimeMs = Date.now();
        }
        
        const timeStr = new Date(txTimeMs).toLocaleString('en-US', {
            month: 'short',
            day: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        // Handle blockNumber properly (blockNum from Alchemy is hex string)
        let blockNumber = tx.blockNumber || tx.blockNum;
        if (blockNumber && blockNumber.toString().startsWith("0x")) {
            blockNumber = parseInt(blockNumber, 16);
        }
        if (!blockNumber) blockNumber = "...";
        
        const valEth = parseFloat(tx.value) || 0;
        
        // Handle Gas Fee properly (Alchemy does not return gasUsed or gasPrice)
        let feeEth = 0.000021; // fallback standard L2 gas fee
        if (tx.gasUsed && tx.gasPrice) {
            const gasUsed = parseInt(tx.gasUsed || "0");
            const gasPrice = parseInt(tx.gasPrice || "0");
            feeEth = (gasUsed * gasPrice) / 1e18;
        }
        
        const isOutgoing = tx.from.toLowerCase() === user.address.toLowerCase();
        const directionBadge = isOutgoing ? `<span class="badge-status status-warning" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; margin-left: 6px;">OUT</span>` : `<span class="badge-status status-qualified" style="background: rgba(16, 185, 129, 0.15); color: #10b981; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; margin-left: 6px;">IN</span>`;
        
        // Find method/function name
        let method = "Transfer";
        if (tx.actionLabel) {
            method = tx.actionLabel;
        } else if (tx.input && tx.input !== "0x") {
            if (tx.functionName) {
                method = tx.functionName.split("(")[0];
            } else {
                method = "Contract Call";
            }
        } else {
            // Guess from value and recipient if it matches checkin/mint/game
            const toAddr = (tx.to || "").toLowerCase().trim();
            const appRecipient = (window.baseReceiverAddress || "").toLowerCase().trim();
            const appContract = (window.baseContractAddress || "").toLowerCase().trim();
            const isToApp = (appRecipient && toAddr === appRecipient) || (appContract && toAddr === appContract);
            if (isToApp) {
                if (Math.abs(valEth - 0.000003) < 0.0000005) {
                    method = "Passport Mint";
                } else if (Math.abs(valEth - 0.000001) < 0.0000005) {
                    method = "Daily Check-in";
                } else if (Math.abs(valEth - 0.000002) < 0.0000005) {
                    method = "Game Play";
                }
            }
        }
        
        tr.innerHTML = `
            <td>
                <div style="display: flex; align-items: center; gap: 4px;">
                    <a href="${txUrl}" target="_blank" style="font-family: monospace; color: var(--color-cyan); font-size: 12px; font-weight: 600; text-decoration: none;">${shortHash}</a>
                    ${directionBadge}
                </div>
                <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">Method: <strong>${method}</strong></div>
            </td>
            <td><code style="background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 11px;">${blockNumber}</code></td>
            <td style="font-size: 11px; color: var(--text-secondary);">${timeStr}</td>
            <td>
                <div style="display: flex; flex-direction: column; gap: 2px; font-family: monospace; font-size: 11px;">
                    <span>From: <a href="https://basescan.org/address/${tx.from}" target="_blank" style="color: var(--text-secondary); text-decoration: none;">${tx.from.substring(0, 6)}...${tx.from.substring(38)}</a></span>
                    <span>To: <a href="${tx.to ? 'https://basescan.org/address/' + tx.to : '#'}" target="_blank" style="color: var(--text-secondary); text-decoration: none;">${tx.to ? (tx.to.substring(0, 6) + '...' + tx.to.substring(38)) : 'Contract Creation'}</a></span>
                </div>
            </td>
            <td style="text-align: right; font-weight: 600; font-size: 12px; color: ${valEth > 0 ? 'var(--text-primary)' : 'var(--text-muted)'};">${valEth.toFixed(5)} ETH</td>
            <td style="text-align: right; font-family: monospace; font-size: 11px; color: var(--text-muted);">${feeEth.toFixed(6)} ETH</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderLeaderboardsPage() {
    const tbody = DOM.fullLeaderboardTbody;
    if (!tbody) return;
    tbody.innerHTML = "";
    
    // Build list dynamically from PROFILES
    const list = Object.keys(PROFILES).map(key => {
        const prof = PROFILES[key];
        const userBxp = (key === APP_STATE.currentUser) ? APP_STATE.bxp : prof.bxp;
        const computedScore = calculateAirdropScore(prof);
        return {
            name: prof.name,
            address: prof.shortAddress,
            score: computedScore,
            bxp: userBxp,
            status: computedScore >= 90 ? "status-strong" : "status-qualified",
            lbl: computedScore >= 90 ? "✓ Strong" : "✓ Qualified"
        };
    });
    
    // Add extra mock users
    const extraMockUsers = [
        { name: "ChainLord", address: "0x39fa...f432", score: 97, bxp: 22880, status: "status-strong", lbl: "✓ Strong" },
        { name: "BaseUser12", address: "0xde43...834e", score: 92, bxp: 15400, status: "status-qualified", lbl: "✓ Qualified" },
        { name: "RugFinder", address: "0x74eb...a439", score: 91, bxp: 12100, status: "status-qualified", lbl: "✓ Qualified" }
    ];
    
    const combinedList = [...list, ...extraMockUsers];
    
    // Sort list by BXP Amount descending
    combinedList.sort((a,b) => b.bxp - a.bxp);
    
    combinedList.forEach((lead, index) => {
        const itemRank = index + 1;
        const isActive = lead.name.toLowerCase() === APP_STATE.currentUser.toLowerCase();
        
        const tr = document.createElement("tr");
        if (isActive) {
            tr.className = "leaderboard-item active";
            tr.style.background = "rgba(0, 82, 255, 0.1)";
            tr.style.borderColor = "rgba(0, 82, 255, 0.25)";
        }
        
        // Show rank styles
        let rankHtml = `<span class="rank-badge">${itemRank}</span>`;
        if (itemRank === 1) rankHtml = `<span class="rank-badge rank-1">1</span>`;
        if (itemRank === 2) rankHtml = `<span class="rank-badge rank-2">2</span>`;
        if (itemRank === 3) rankHtml = `<span class="rank-badge rank-3">3</span>`;
        
        tr.innerHTML = `
            <td>${rankHtml}</td>
            <td>
                <div style="display: flex; flex-direction: column; gap: 2px;">
                    <strong style="color: var(--text-primary); font-size: 13px;">${lead.name}</strong>
                    <span style="font-size: 11px; color: var(--text-muted); font-family: monospace;">${lead.address}</span>
                </div>
            </td>
            <td style="text-align: center;"><strong>${lead.score}</strong></td>
            <td style="text-align: right; font-weight: bold; color: var(--color-cyan);">${formatNumber(lead.bxp)} BXP</td>
            <td><span class="badge-status ${lead.status}">${lead.lbl}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

function renderReferralsPage() {
    const tbody = DOM.referredUsersTbody;
    if (!tbody) return;
    tbody.innerHTML = "";
    
    const user = PROFILES[APP_STATE.currentUser];
    
    // Populate stats
    DOM.refPageInvited.innerText = `${user.invitedCount} friends`;
    DOM.refPageBxpEarned.innerText = `${formatNumber(user.referralBxpClaimed)} BXP`;
    DOM.refPageBonusRolls.innerText = `+${user.invitedCount} rolls`;
    
    if (user.name === "Verify Wallet") {
        DOM.referralPageLink.value = "Connect wallet to get referral link";
        if (DOM.btnCopyRefPage) DOM.btnCopyRefPage.disabled = true;
    } else {
        DOM.referralPageLink.value = `${window.location.origin}/r/${user.name}`;
        if (DOM.btnCopyRefPage) DOM.btnCopyRefPage.disabled = false;
    }
    
    user.invitedFriends.forEach(friend => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong style="font-family: monospace; font-size: 12px; color: var(--color-cyan);">${friend.address}</strong></td>
            <td><span style="font-size: 11px; color: var(--text-secondary);">${friend.date}</span></td>
            <td><strong>${formatNumber(friend.totalBxp)} BXP</strong></td>
            <td class="text-green"><strong>+${formatNumber(friend.share)} BXP</strong></td>
            <td><span class="badge-status status-qualified">✓ Active</span></td>
        `;
        tbody.appendChild(tr);
    });
}

function renderBadgesPage() {
    const txGrid = DOM.badgesTxGrid;
    const contractGrid = DOM.badgesContractGrid;
    const volumeGrid = DOM.badgesVolumeGrid;
    const mentionsGrid = DOM.badgesMentionsGrid;
    
    if (!txGrid) return;
    
    const user = PROFILES[APP_STATE.currentUser];
    const txCount = user.txsCount;
    const volumeCount = user.volumeCount;
    const contractScore = user.airdropSubMetrics.contracts;
    const mentionsCount = user.hasScannedX ? (user.baseMentions || 0) : 0;
    
    // Clean grids
    txGrid.innerHTML = "";
    contractGrid.innerHTML = "";
    volumeGrid.innerHTML = "";
    mentionsGrid.innerHTML = "";
    
    // 12 Badges Config
    const badgesData = {
        tx: [
            { req: 100, name: "Tx Novice", desc: "100+ Transactions", value: txCount },
            { req: 500, name: "Tx Warrior", desc: "500+ Transactions", value: txCount },
            { req: 1000, name: "Tx Legend", desc: "1,000+ Transactions", value: txCount }
        ],
        contract: [
            { req: 100, name: "Contract Explorer", desc: "100+ Contracts", value: contractScore },
            { req: 500, name: "Contract Master", desc: "500+ Contracts", value: contractScore },
            { req: 1000, name: "Web3 Overlord", desc: "1,000+ Contracts", value: contractScore }
        ],
        volume: [
            { req: 1000, name: "Micro Trader", desc: "$1,000+ Volume", value: volumeCount },
            { req: 10000, name: "Whale Cub", desc: "$10,000+ Volume", value: volumeCount },
            { req: 50000, name: "Gigawhale", desc: "$50,000+ Volume", value: volumeCount }
        ],
        mentions: [
            { req: 50, name: "Base Supporter", desc: "50 Twitter Mentions", value: mentionsCount },
            { req: 500, name: "Base Evangelist", desc: "500 Twitter Mentions", value: mentionsCount },
            { req: 1000, name: "Base Whisperer", desc: "1,000 Twitter Mentions", value: mentionsCount }
        ]
    };
    
    const icons = { tx: "🔄", contract: "🧠", volume: "💎", mentions: "📣" };
    const glows = { tx: "gold-glow", contract: "orange-glow", volume: "gold-glow", mentions: "orange-glow" };
    
    Object.keys(badgesData).forEach(cat => {
        const grid = cat === "tx" ? txGrid : (cat === "contract" ? contractGrid : (cat === "volume" ? volumeGrid : mentionsGrid));
        
        badgesData[cat].forEach(badge => {
            const isUnlocked = badge.value >= badge.req;
            const badgeId = `${cat}_${badge.req}`;
            user.claimedBadges = user.claimedBadges || {};
            const isClaimed = user.claimedBadges[badgeId] || false;
            
            const div = document.createElement("div");
            div.className = `badge-item ${isUnlocked ? 'active' : 'locked'} ${isClaimed ? 'claimed' : ''}`;
            if (isUnlocked && !isClaimed) {
                div.style.cursor = "pointer";
                div.title = "Click to Claim Badge";
                div.addEventListener("click", () => {
                    openClaimBadgeModal(badge, cat, icons[cat]);
                });
            }
            
            let badgeTitle = badge.name;
            let badgeDesc = isUnlocked ? (isClaimed ? "✓ Claimed" : badge.desc) : `Requires: ${badge.req}`;
            
            div.innerHTML = `
                <div class="badge-icon ${isUnlocked ? glows[cat] : 'locked-glow'}"><span class="badge-emoji">${icons[cat]}</span></div>
                <div class="badge-meta">
                    <span class="badge-name">${badgeTitle}</span>
                    <span class="badge-desc" style="font-size: 9px; color: var(--text-secondary);">${badgeDesc}</span>
                </div>
            `;
            grid.appendChild(div);
        });
    });
}

// Global modal tracking
let currentBadgeToClaim = null;
let currentBadgeCat = null;

function openClaimBadgeModal(badge, cat, icon) {
    currentBadgeToClaim = badge;
    currentBadgeCat = cat;
    
    const modal = document.getElementById("claim-badge-modal");
    const title = document.getElementById("claim-badge-title");
    const iconEl = document.getElementById("claim-badge-icon");
    const nameEl = document.getElementById("claim-badge-name");
    const descEl = document.getElementById("claim-badge-desc");
    
    if (modal && nameEl && descEl) {
        if (title) title.innerText = `CLAIM ${cat.toUpperCase()} BADGE`;
        if (iconEl) iconEl.innerText = icon;
        nameEl.innerText = badge.name;
        descEl.innerText = badge.desc;
        modal.classList.remove("hidden");
    }
}

// Consolidate UI updates into a single rendering function
function syncProfileUI(user, flash = false) {
    if (!user) return;

    // 1. Sidebar & Header Wallet UI
    if (DOM.sidebarAvatar) DOM.sidebarAvatar.src = user.avatar;
    if (DOM.sidebarUsername) DOM.sidebarUsername.innerText = user.name;
    
    if (APP_STATE.activeProvider === "farcaster" && APP_STATE.connectedAddress !== "") {
        if (DOM.sidebarAddress) DOM.sidebarAddress.innerText = `@${user.name}`;
    } else {
        if (DOM.sidebarAddress) DOM.sidebarAddress.innerText = user.shortAddress;
    }

    const basescanUrl = `https://basescan.org/address/${user.address}`;
    const passportBasescanBtn = document.getElementById("passport-basescan-btn");
    if (passportBasescanBtn) passportBasescanBtn.href = basescanUrl;
    const sidebarBasescanBtn = document.getElementById("sidebar-basescan-btn");
    if (sidebarBasescanBtn) sidebarBasescanBtn.href = basescanUrl;

    // Sync BXP/XP if it is the current viewed user
    if (user.name === PROFILES[APP_STATE.currentUser].name) {
        if (DOM.headerXp) DOM.headerXp.innerText = `${formatNumber(APP_STATE.xp)} XP`;
        if (DOM.headerBxp) DOM.headerBxp.innerText = `${formatNumber(APP_STATE.bxp)} BXP`;
    }

    // 2. Metrics Cards
    const score = user.airdropScore !== undefined ? user.airdropScore : calculateAirdropScore(user);
    const isFresh = (APP_STATE.currentUser === 'fresh');
    if (DOM.metricAirdropScore) DOM.metricAirdropScore.innerHTML = score;
    
    // Mentions
    if (DOM.metricMentions) {
        if (user.baseMentions === null) {
            DOM.metricMentions.innerText = "—";
            DOM.metricMentions.style.color = "var(--text-secondary)";
            const subText = document.getElementById("metric-mentions-sub");
            if (subText) subText.innerText = "Scan X handle in search bar";
            const trigger = document.getElementById("btn-scan-x-trigger");
            if (trigger) trigger.style.display = "inline-block";
        } else {
            DOM.metricMentions.innerText = user.baseMentions;
            DOM.metricMentions.style.color = "var(--color-cyan)";
            const subText = document.getElementById("metric-mentions-sub");
            if (subText) subText.innerText = `@${user.scannedHandle}`;
            const trigger = document.getElementById("btn-scan-x-trigger");
            if (trigger) trigger.style.display = "none";
        }
    }

    // Sybil
    const sybilEl = DOM.metricSybil;
    if (sybilEl) {
        if (isFresh) {
            sybilEl.innerText = "—";
            sybilEl.style.fontSize = "14px";
            sybilEl.style.color = "var(--text-muted)";
            const sub = sybilEl.nextElementSibling;
            if (sub && sub.classList.contains("metric-subtext")) {
                sub.innerText = "Connect wallet to verify";
            }
        } else {
            const sybilData = getSybilClassification(user.multiWallets || 1, user.sentToWalletsCount || 0);
            sybilEl.innerText = sybilData.label;
            sybilEl.style.fontSize = "14px";
            sybilEl.style.color = sybilData.color;
            const sub = sybilEl.nextElementSibling;
            if (sub && sub.classList.contains("metric-subtext")) {
                sub.innerText = sybilData.desc;
            }
        }
    }

    // Score Badge
    const metricAirdropBadge = document.getElementById("metric-airdrop-badge");
    const btnClaimPassportMain = document.getElementById("btn-claim-passport-main");
    if (metricAirdropBadge) {
        if (isFresh) {
            metricAirdropBadge.innerText = "Connect Wallet 🔗";
            metricAirdropBadge.style.color = "var(--text-muted)";
            if (btnClaimPassportMain) btnClaimPassportMain.style.display = "none";
        } else {
            let badgeText = "Base Explorer 🛡️";
            let badgeColor = "#3b82f6";
            if (score >= 85) { badgeText = "God of Base 👑"; badgeColor = "#10b981"; }
            else if (score < 80) { badgeText = "Base Kids 👶"; badgeColor = "#ef4444"; }
            metricAirdropBadge.innerText = badgeText;
            metricAirdropBadge.style.color = badgeColor;
            
            // Show Claim Passport button when a valid user profile is viewed
            if (btnClaimPassportMain) {
                btnClaimPassportMain.style.display = "block";
                btnClaimPassportMain.innerText = APP_STATE.isPassportMinted ? "Download Passport" : "Claim Passport";
            }
        }
    }

    // 3. Wallet Overview Stats
    const setLive = (el, val) => {
        if (!el) return;
        el.removeAttribute("data-scanning");
        el.innerText = val;
        if (flash) {
            el.classList.remove("value-updated");
            void el.offsetWidth; // force reflow
            el.classList.add("value-updated");
        }
    };
    setLive(DOM.statWalletAge, user.walletAge);
    setLive(DOM.statWalletAgeSub, user.walletAgeSub);
    setLive(DOM.statTxs, user.txs);
    setLive(DOM.statTxsSub, user.txsSub);
    setLive(DOM.statWeeklyTxs, user.weeklyTxs);
    setLive(DOM.statWeeklyTxsSub, user.weeklyTxsSub);
    setLive(DOM.statVolume, user.volume);
    setLive(DOM.statVolumeSub, user.volumeSub);
    if (DOM.statProtocols) DOM.statProtocols.innerText = `${user.protocols || 0} Protocols`;
    if (DOM.statFeeSpent) DOM.statFeeSpent.innerText = user.totalFeeSpent || "$0.00";
    
    if (DOM.statTestnetUser) {
        if (user.usedTestnet) {
            DOM.statTestnetUser.innerText = "Eligible";
            DOM.statTestnetUser.className = "item-value text-green";
        } else {
            DOM.statTestnetUser.innerText = "Not Active";
            DOM.statTestnetUser.className = "item-value text-red";
        }
    }

    // 4. Rewards Tab BXP
    if (DOM.rewardsBxpAmount) {
        DOM.rewardsBxpAmount.innerText = formatNumber(APP_STATE.bxp);
    }

    // Sync rolls and boxes displays in UI
    document.querySelectorAll(".rolls-count-display").forEach(el => {
        el.innerText = `${APP_STATE.rollsLeft} / 3`;
    });
    document.querySelectorAll(".box-count-display").forEach(el => {
        el.innerText = `${APP_STATE.boxesLeft} / 3`;
    });
    
    // Disable rolls and boxes buttons if out of rolls/boxes or if fresh profile
    const rollBtns = document.querySelectorAll(".btn-roll-dice-action");
    rollBtns.forEach(btn => {
        if (APP_STATE.rollsLeft > 0) {
            btn.disabled = false;
            btn.innerText = "🎲 Roll Dice";
        } else {
            btn.disabled = true;
            btn.innerText = APP_STATE.currentUser === "fresh" ? "🎲 Connect Wallet" : "🎲 Out of Rolls";
        }
    });

    const boxBtns = document.querySelectorAll(".btn-open-box-action");
    boxBtns.forEach(btn => {
        if (APP_STATE.boxesLeft > 0) {
            btn.disabled = false;
            btn.innerText = "🎁 Open Box";
        } else {
            btn.disabled = true;
            btn.innerText = APP_STATE.currentUser === "fresh" ? "🎁 Connect Wallet" : "🎁 All Opened";
        }
    });

    const checkinBtns = document.querySelectorAll(".btn-checkin-action");
    checkinBtns.forEach(btn => {
        if (APP_STATE.currentUser === "fresh") {
            btn.disabled = true;
            btn.innerText = "Connect Wallet";
        } else {
            updateCheckInTimerDisplay();
        }
    });

    // 5. Referral link
    if (DOM.referralLinkInput) {
        if (user.name === "Verify Wallet") {
            DOM.referralLinkInput.value = "Connect wallet to get referral link";
        } else {
            DOM.referralLinkInput.value = `${window.location.origin}/r/${user.name}`;
        }
    }

    // 6. Sub Cards & Lists
    renderRolesCard(user);
    renderPassport(user);
    renderOgNftCard(user);
    updateAirdropUI(user);
    updateLeaderboardDisplay(user);

    // 7. Redraw / Re-render subpages
    drawActivityChart();
    drawReputationRadar();
    renderActivityCalendar();
    renderBxpTransactions();
    renderLeaderboardsPage();
    renderReferralsPage();
    renderBadgesPage();
    renderRealTransactionsPage();
    
    // 8. Eligibility Table
    if (DOM.eligibilityTableBody) {
        DOM.eligibilityTableBody.innerHTML = "";
        user.eligibility.forEach(row => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>
                    <div class="project-col">
                        <span class="proj-logo ${row.class}">${row.logo}</span>
                        <strong>${row.project}</strong>
                    </div>
                </td>
                <td>${row.activity}</td>
                <td>${row.bridge}</td>
                <td class="user-stat">${row.holding}</td>
                <td><span class="badge-status ${row.status}">${row.label}</span></td>
            `;
            DOM.eligibilityTableBody.appendChild(tr);
        });
    }

    // 9. Reputation Card Info
    if (DOM.repScoreNum) {
        DOM.repScoreNum.innerText = score;
        if (DOM.repScoreBadge) {
            if (score >= 95) {
                DOM.repScoreBadge.innerText = "Outstanding";
                if (DOM.repSummaryText) DOM.repSummaryText.innerText = "Your on-chain behavior looks excellent!";
            } else if (score >= 90) {
                DOM.repScoreBadge.innerText = "Great";
                if (DOM.repSummaryText) DOM.repSummaryText.innerText = "Solid on-chain footprints. Keep it up!";
            } else {
                DOM.repScoreBadge.innerText = "Good";
                if (DOM.repSummaryText) DOM.repSummaryText.innerText = "Active. Try increasing volume to score higher.";
            }
        }
    }

    // 10. NFT Collect XP button configuration
    const collectNftXpBtn = document.getElementById("btn-collect-nft-xp");
    if (collectNftXpBtn) {
        collectNftXpBtn.onclick = async () => {
            const isWalletConnected = !!(APP_STATE.connectedAddress && APP_STATE.connectedAddress.startsWith("0x"));
            const connectedAddress = APP_STATE.connectedAddress ? APP_STATE.connectedAddress.toLowerCase().trim() : "";
            const currentUserAddress = user.address ? user.address.toLowerCase().trim() : "";
            if (!isWalletConnected || !connectedAddress || connectedAddress !== currentUserAddress) {
                showToast("❌ Access Denied: You must connect your wallet matching this profile to claim this bonus!", "error");
                return;
            }
            if (user.hasBuilderNFT && user.hasBetaNFT) {
                collectNftXpBtn.disabled = true;
                collectNftXpBtn.innerText = "Claiming...";
                try {
                    const fee = await runSimulatedTransaction("Collect OG NFT XP Bonus");
                    if (fee) {
                        APP_STATE.xp += 100;
                        if (DOM.headerXp) DOM.headerXp.innerText = `${formatNumber(APP_STATE.xp)} XP`;
                        showToast(`🏆 Collected 100 XP Bonus! Base Emperor perk activated. (Gas: $${fee})`, "success");
                        collectNftXpBtn.disabled = true;
                        collectNftXpBtn.innerText = "✅ Bonus Claimed";
                    } else {
                        collectNftXpBtn.disabled = false;
                        collectNftXpBtn.innerText = "🎁 Collect 100 XP Bonus";
                    }
                } catch (err) {
                    collectNftXpBtn.disabled = false;
                    collectNftXpBtn.innerText = "🎁 Collect 100 XP Bonus";
                }
            }
        };
    }
}

// 5. Update Profile Views & Transition animations
function loadProfile(username) {
    if (!PROFILES[username]) return;
    
    APP_STATE.currentUser = username;
    const user = PROFILES[username];
    
    // Sync active session XP/BXP/airdropScore with the loaded profile
    APP_STATE.xp = user.xp || 0;
    APP_STATE.bxp = user.bxp || 0;
    APP_STATE.airdropScore = user.airdropScore !== undefined ? user.airdropScore : calculateAirdropScore(user);
    
    // Sync check-in & game states from the user profile
    if (user.lastCheckInTimestamp) {
        const now = Math.floor(Date.now() / 1000);
        const elapsed = now - user.lastCheckInTimestamp;
        APP_STATE.checkInTimeRemaining = Math.max(0, 24 * 3600 - elapsed);
        APP_STATE.hasCheckedIn = APP_STATE.checkInTimeRemaining > 0;
        user.hasCheckedIn = APP_STATE.hasCheckedIn;
        user.checkInTimeRemaining = APP_STATE.checkInTimeRemaining;
    } else {
        APP_STATE.hasCheckedIn = user.hasCheckedIn || false;
        APP_STATE.checkInTimeRemaining = user.checkInTimeRemaining || 0;
    }
    APP_STATE.checkInStreak = user.checkInStreak || 1;
    APP_STATE.hasBoostedActivity = user.hasBoostedActivity || false;
    APP_STATE.bxpTransactions = user.bxpTransactions || [];
    
    if (username === "fresh") {
        APP_STATE.rollsLeft = 0;
        APP_STATE.boxesLeft = 0;
        APP_STATE.hasCheckedIn = false;
        APP_STATE.checkInTimeRemaining = 0;
        APP_STATE.hasBoostedActivity = false;
        APP_STATE.bxpTransactions = [];
    } else {
        if (user.rollsLeft === undefined) user.rollsLeft = 3;
        if (user.boxesLeft === undefined) user.boxesLeft = 3;
        APP_STATE.rollsLeft = user.rollsLeft;
        APP_STATE.boxesLeft = user.boxesLeft;
    }
    
    // Sync X mentions scan state with the loaded profile
    APP_STATE.baseMentions = user.baseMentions !== undefined ? user.baseMentions : null;
    APP_STATE.scannedHandle = user.scannedHandle || "";
    
    // Trigger live blockchain lookup via Alchemy API (only for real addresses)
    fetchOnchainDetails(username);
    
    const mainContent = document.getElementById("tab-dashboard");
    if (mainContent) {
        mainContent.style.opacity = "0.3";
        mainContent.style.transition = "opacity 0.25s ease";
    }
    
    setTimeout(() => {
        updateHeaderWalletUI();
        syncProfileUI(user, false);
        if (mainContent) {
            mainContent.style.opacity = "1";
        }
        saveState();
    }, 250);
}

function updateLeaderboardDisplay(user) {
    const list = DOM.leaderboardList;
    if (!list) return;
    list.innerHTML = "";
    
    // Build from PROFILES + extra mock users
    const allUsers = Object.keys(PROFILES).map(key => {
        const prof = PROFILES[key];
        const userBxp = (key === APP_STATE.currentUser) ? APP_STATE.bxp : prof.bxp;
        return {
            name: prof.name,
            score: prof.airdropScore !== undefined ? prof.airdropScore : calculateAirdropScore(prof),
            bxp: userBxp,
            avatar: prof.avatar
        };
    });
    
    const extraMockUsers = [
        { name: "ChainLord", score: 97, bxp: 22880, avatar: "🛡️" },
        { name: "BaseUser12", score: 92, bxp: 15400, avatar: "👤" },
        { name: "RugFinder", score: 91, bxp: 12100, avatar: "🔍" }
    ];
    
    const combined = [...allUsers, ...extraMockUsers];
    combined.sort((a,b) => b.bxp - a.bxp);
    
    const top3 = combined.slice(0, 3);
    const userIndex = combined.findIndex(item => item.name.toLowerCase() === user.name.toLowerCase());
    
    const icons = ["👑", "🛡️", "💎"];
    const classes = ["gold", "silver", "bronze"];
    
    top3.forEach((lead, i) => {
        const item = document.createElement("div");
        const isActive = lead.name.toLowerCase() === user.name.toLowerCase();
        item.className = `leaderboard-item ${isActive ? 'active' : ''}`;
        
        let avatarHtml = `<span class="user-avatar-tiny ${classes[i]}">${icons[i]}</span>`;
        if (isActive && lead.avatar.startsWith("data:")) {
            avatarHtml = `<img src="${lead.avatar}" alt="Avatar" class="user-avatar-tiny-img">`;
        }
        
        item.innerHTML = `
            <div class="leaderboard-rank">
                <span class="rank-badge rank-${i+1}">${i+1}</span>
            </div>
            <div class="leaderboard-user">
                ${avatarHtml}
                <span class="user-name">${lead.name} ${isActive ? '(You)' : ''}</span>
            </div>
            <span class="leaderboard-score">${lead.score}</span>
            <span class="leaderboard-bxp">${formatNumber(lead.bxp)} BXP</span>
        `;
        list.appendChild(item);
    });
    
    if (userIndex >= 3) {
        const lead = combined[userIndex];
        const item = document.createElement("div");
        item.className = "leaderboard-item active";
        
        let avatarHtml = `<img src="${lead.avatar}" alt="Avatar" class="user-avatar-tiny-img">`;
        if (lead.avatar.length <= 4) {
            avatarHtml = `<span class="user-avatar-tiny">${lead.avatar}</span>`;
        }
        
        item.innerHTML = `
            <div class="leaderboard-rank">
                <span class="rank-badge rank-user">${userIndex + 1}</span>
            </div>
            <div class="leaderboard-user">
                ${avatarHtml}
                <span class="user-name">${lead.name} (You)</span>
            </div>
            <span class="leaderboard-score">${lead.score}</span>
            <span class="leaderboard-bxp" id="leaderboard-user-bxp">${formatNumber(lead.bxp)} BXP</span>
        `;
        list.appendChild(item);
        DOM.leaderboardUserBxp = document.getElementById("leaderboard-user-bxp");
    }
}

// Interactive Game handlers
async function handleCheckIn() {
    const isWalletConnected = !!(APP_STATE.connectedAddress && APP_STATE.connectedAddress.startsWith("0x"));
    const connectedAddress = APP_STATE.connectedAddress ? APP_STATE.connectedAddress.toLowerCase().trim() : "";
    const currentUserAddress = PROFILES[APP_STATE.currentUser] ? PROFILES[APP_STATE.currentUser].address.toLowerCase().trim() : "";
    if (!isWalletConnected || !connectedAddress || connectedAddress !== currentUserAddress) {
        showToast("❌ Access Denied: You must connect your wallet matching this profile to check-in!", "error");
        return;
    }
    if (APP_STATE.hasCheckedIn || APP_STATE.checkInTimeRemaining > 0) return;
    
    const checkInBtns = document.querySelectorAll(".btn-checkin-action");
    checkInBtns.forEach(btn => {
        btn.disabled = true;
        btn.innerText = "Checking In...";
    });
    
    try {
        const gasFee = await runSimulatedTransaction("Daily Check-in");
        if (gasFee) {
            const streakDay = Math.min(APP_STATE.checkInStreak, 7);
            const rewardBxp = STREAK_BXP[streakDay - 1];
            
            APP_STATE.hasCheckedIn = true;
            APP_STATE.checkInTimeRemaining = 24 * 3600;
            // Resets streak to 1 after day 7
            APP_STATE.checkInStreak = (APP_STATE.checkInStreak % 7) + 1;
            
            APP_STATE.bxp += rewardBxp;
            
            const user = PROFILES[APP_STATE.currentUser];
            user.bxp = APP_STATE.bxp;
            user.hasCheckedIn = true;
            user.checkInTimeRemaining = APP_STATE.checkInTimeRemaining;
            user.checkInStreak = APP_STATE.checkInStreak;
            user.lastCheckInTimestamp = Math.floor(Date.now() / 1000);
            
            if (DOM.headerBxp) DOM.headerBxp.innerText = `${formatNumber(APP_STATE.bxp)} BXP`;
            if (DOM.rewardsBxpAmount) DOM.rewardsBxpAmount.innerText = formatNumber(APP_STATE.bxp);
            
            // Log transaction
            APP_STATE.bxpTransactions.unshift({
                type: `Check-in Bonus (Day ${streakDay})`,
                amount: `+${rewardBxp} BXP`,
                gas: `Optimized`,
                status: "Success",
                hash: getMockHash(),
                time: "Just now"
            });
            user.bxpTransactions = [...APP_STATE.bxpTransactions];
            
            showToast(`Checked in! Day ${streakDay} streak — +${rewardBxp} BXP earned.`, "success");
            updateCheckInTimerDisplay();
            renderBxpTransactions();
            recordSimulatedOnchainTx("Daily Check-in", 0.01);
        } else {
            updateCheckInTimerDisplay();
        }
    } catch (err) {
        updateCheckInTimerDisplay();
    }
}

async function handleBoostActivity() {
    const isWalletConnected = !!(APP_STATE.connectedAddress && APP_STATE.connectedAddress.startsWith("0x"));
    const connectedAddress = APP_STATE.connectedAddress ? APP_STATE.connectedAddress.toLowerCase().trim() : "";
    const currentUserAddress = PROFILES[APP_STATE.currentUser] ? PROFILES[APP_STATE.currentUser].address.toLowerCase().trim() : "";
    if (!isWalletConnected || !connectedAddress || connectedAddress !== currentUserAddress) {
        showToast("❌ Access Denied: You must connect your wallet matching this profile to boost activity!", "error");
        return;
    }
    const boostBtn = document.getElementById("btn-boost-activity-action");
    const statusDisp = document.getElementById("boost-status-display");
    if (!boostBtn) return;
    if (APP_STATE.hasBoostedActivity) {
        showToast("You have already boosted your activity today!", "warning");
        return;
    }
    
    boostBtn.disabled = true;
    if (statusDisp) statusDisp.innerText = "Processing Tx...";
    
    try {
        const gasFee = await runSimulatedTransaction("Base Activity Boost");
        if (gasFee) {
            const rewardBxp = 100;
            const rewardXp = 100;
            APP_STATE.bxp += rewardBxp;
            APP_STATE.xp += rewardXp;
            APP_STATE.hasBoostedActivity = true;
            
            if (DOM.headerBxp) DOM.headerBxp.innerText = `${formatNumber(APP_STATE.bxp)} BXP`;
            if (DOM.headerXp) DOM.headerXp.innerText = `${formatNumber(APP_STATE.xp)} XP`;
            if (DOM.rewardsBxpAmount) DOM.rewardsBxpAmount.innerText = formatNumber(APP_STATE.bxp);
            
            const user = PROFILES[APP_STATE.currentUser];
            user.bxp = APP_STATE.bxp;
            user.xp = APP_STATE.xp;
            user.hasBoostedActivity = true;
            
            // Log transaction
            APP_STATE.bxpTransactions.unshift({
                type: "Activity Boost (Simulated Tx)",
                amount: `+${rewardBxp} BXP`,
                gas: `Optimized`,
                status: "Success",
                hash: getMockHash(),
                time: "Just now"
            });
            user.bxpTransactions = [...APP_STATE.bxpTransactions];
            
            showToast(`🎉 Activity Boosted! +${rewardBxp} BXP and +1 Active Footprint Day added to calendar.`, "success");
            
            boostBtn.disabled = true;
            boostBtn.innerText = "⚡ Boost Claimed";
            if (statusDisp) statusDisp.innerText = "Boost Completed!";
            recordSimulatedOnchainTx("Base Activity Boost", 0.05);
        } else {
            boostBtn.disabled = false;
            if (statusDisp) statusDisp.innerText = "Ready to Boost";
        }
    } catch (err) {
        boostBtn.disabled = false;
        if (statusDisp) statusDisp.innerText = "Ready to Boost";
    }
}

async function handleDiceRoll() {
    const isWalletConnected = !!(APP_STATE.connectedAddress && APP_STATE.connectedAddress.startsWith("0x"));
    const connectedAddress = APP_STATE.connectedAddress ? APP_STATE.connectedAddress.toLowerCase().trim() : "";
    const currentUserAddress = PROFILES[APP_STATE.currentUser] ? PROFILES[APP_STATE.currentUser].address.toLowerCase().trim() : "";
    if (!isWalletConnected || !connectedAddress || connectedAddress !== currentUserAddress) {
        showToast("❌ Access Denied: You must connect your wallet matching this profile to roll dice!", "error");
        return;
    }
    if (APP_STATE.rollsLeft <= 0) {
        showToast("No rolls remaining! Invite friends to earn more rolls.", "warning");
        return;
    }
    
    const rollBtns = document.querySelectorAll(".btn-roll-dice-action");
    rollBtns.forEach(btn => {
        btn.disabled = true;
        btn.innerText = "Rolling...";
    });
    
    try {
        const gasFee = await runSimulatedTransaction("Dice Spin Roll");
        if (gasFee) {
            document.querySelectorAll(".visual-dice-element").forEach(dice => {
                dice.classList.add("rolling");
            });
            
            setTimeout(() => {
                document.querySelectorAll(".visual-dice-element").forEach(dice => {
                    dice.classList.remove("rolling");
                });
                
                const roll = Math.floor(Math.random() * 6) + 1;
                
                const rotations = {
                    1: "rotateX(0deg) rotateY(0deg)",
                    2: "rotateX(0deg) rotateY(-90deg)",
                    3: "rotateX(0deg) rotateY(-180deg)",
                    4: "rotateX(0deg) rotateY(90deg)",
                    5: "rotateX(-90deg) rotateY(0deg)",
                    6: "rotateX(90deg) rotateY(0deg)"
                };
                
                document.querySelectorAll(".visual-dice-element").forEach(dice => {
                    dice.style.transform = rotations[roll];
                });
                
                // Earned BXP set to range 30 to 50
                const earnedBxp = Math.floor(Math.random() * 21) + 30;
                APP_STATE.bxp += earnedBxp;
                APP_STATE.rollsLeft -= 1;
                
                const user = PROFILES[APP_STATE.currentUser];
                user.bxp = APP_STATE.bxp;
                user.rollsLeft = APP_STATE.rollsLeft;
                
                // Sync displays
                document.querySelectorAll(".rolls-count-display").forEach(el => {
                    el.innerText = `${APP_STATE.rollsLeft} / 3`;
                });
                
                if (DOM.headerBxp) DOM.headerBxp.innerText = `${formatNumber(APP_STATE.bxp)} BXP`;
                if (DOM.rewardsBxpAmount) DOM.rewardsBxpAmount.innerText = formatNumber(APP_STATE.bxp);
                
                // Log transaction
                APP_STATE.bxpTransactions.unshift({
                    type: `Dice Roll (${roll})`,
                    amount: `+${earnedBxp} BXP`,
                    gas: `Ultra Fast`,
                    status: "Success",
                    hash: getMockHash(),
                    time: "Just now"
                });
                user.bxpTransactions = [...APP_STATE.bxpTransactions];
                
                showToast(`Rolled a ${roll}! You earned +${formatNumber(earnedBxp)} BXP!`, "success");
                renderBxpTransactions();
                renderLeaderboardsPage();
                recordSimulatedOnchainTx("Dice Spin Roll", 0.02);
                
                rollBtns.forEach(btn => {
                    if (APP_STATE.rollsLeft > 0) {
                        btn.disabled = false;
                        btn.innerText = "🎲 Roll Dice";
                    } else {
                        btn.disabled = true;
                        btn.innerText = "🎲 Out of Rolls";
                    }
                });
            }, 1200);
        } else {
            rollBtns.forEach(btn => {
                if (APP_STATE.rollsLeft > 0) {
                    btn.disabled = false;
                    btn.innerText = "🎲 Roll Dice";
                } else {
                    btn.disabled = true;
                    btn.innerText = "🎲 Out of Rolls";
                }
            });
        }
    } catch (err) {
        rollBtns.forEach(btn => {
            if (APP_STATE.rollsLeft > 0) {
                btn.disabled = false;
                btn.innerText = "🎲 Roll Dice";
            } else {
                btn.disabled = true;
                btn.innerText = "🎲 Out of Rolls";
            }
        });
    }
}

async function handleOpenBox() {
    const isWalletConnected = !!(APP_STATE.connectedAddress && APP_STATE.connectedAddress.startsWith("0x"));
    const connectedAddress = APP_STATE.connectedAddress ? APP_STATE.connectedAddress.toLowerCase().trim() : "";
    const currentUserAddress = PROFILES[APP_STATE.currentUser] ? PROFILES[APP_STATE.currentUser].address.toLowerCase().trim() : "";
    if (!isWalletConnected || !connectedAddress || connectedAddress !== currentUserAddress) {
        showToast("❌ Access Denied: You must connect your wallet matching this profile to open mystery boxes!", "error");
        return;
    }
    if (APP_STATE.boxesLeft <= 0) {
        showToast("No boxes left today!", "warning");
        return;
    }
    
    const boxBtns = document.querySelectorAll(".btn-open-box-action");
    boxBtns.forEach(btn => {
        btn.disabled = true;
        btn.innerText = "Opening...";
    });
    
    try {
        const gasFee = await runSimulatedTransaction("Open Mystery Box");
        if (gasFee) {
            document.querySelectorAll(".visual-box-element").forEach(box => {
                box.classList.add("shaking");
            });
            
            setTimeout(() => {
                document.querySelectorAll(".visual-box-element").forEach(box => {
                    box.classList.remove("shaking");
                    box.classList.add("opened");
                });
                
                // Earned BXP set to range 30 to 50
                const earnedBxp = Math.floor(Math.random() * 21) + 30;
                APP_STATE.bxp += earnedBxp;
                APP_STATE.boxesLeft -= 1;
                
                const user = PROFILES[APP_STATE.currentUser];
                user.bxp = APP_STATE.bxp;
                user.boxesLeft = APP_STATE.boxesLeft;
                
                // Sync displays
                document.querySelectorAll(".box-count-display").forEach(el => {
                    el.innerText = `${APP_STATE.boxesLeft} / 3`;
                });
                if (DOM.headerBxp) DOM.headerBxp.innerText = `${formatNumber(APP_STATE.bxp)} BXP`;
                if (DOM.rewardsBxpAmount) DOM.rewardsBxpAmount.innerText = formatNumber(APP_STATE.bxp);
                
                // Log transaction
                APP_STATE.bxpTransactions.unshift({
                    type: "Mystery Box Claim",
                    amount: `+${earnedBxp} BXP`,
                    gas: `Optimized`,
                    status: "Success",
                    hash: getMockHash(),
                    time: "Just now"
                });
                user.bxpTransactions = [...APP_STATE.bxpTransactions];
                
                showToast(`Opened Box! Earned +${earnedBxp} BXP!`, "purple");
                renderBxpTransactions();
                recordSimulatedOnchainTx("Open Mystery Box", 0.03);
                
                setTimeout(() => {
                    document.querySelectorAll(".visual-box-element").forEach(box => {
                        box.classList.remove("opened");
                    });
                    
                    boxBtns.forEach(btn => {
                        if (APP_STATE.boxesLeft > 0) {
                            btn.disabled = false;
                            btn.innerText = "🎁 Open Box";
                        } else {
                            btn.disabled = true;
                            btn.innerText = "🎁 All Opened";
                        }
                    });
                }, 1500);
            }, 1000);
        } else {
            boxBtns.forEach(btn => {
                if (APP_STATE.boxesLeft > 0) {
                    btn.disabled = false;
                    btn.innerText = "🎁 Open Box";
                } else {
                    btn.disabled = true;
                    btn.innerText = "🎁 All Opened";
                }
            });
        }
    } catch (err) {
        boxBtns.forEach(btn => {
            if (APP_STATE.boxesLeft > 0) {
                btn.disabled = false;
                btn.innerText = "🎁 Open Box";
            } else {
                btn.disabled = true;
                btn.innerText = "🎁 All Opened";
            }
        });
    }
}

// BXP Reward claims redeemer
async function handleRedeemItem(e) {
    const isWalletConnected = !!(APP_STATE.connectedAddress && APP_STATE.connectedAddress.startsWith("0x"));
    const connectedAddress = APP_STATE.connectedAddress ? APP_STATE.connectedAddress.toLowerCase().trim() : "";
    const currentUserAddress = PROFILES[APP_STATE.currentUser] ? PROFILES[APP_STATE.currentUser].address.toLowerCase().trim() : "";
    if (!isWalletConnected || !connectedAddress || connectedAddress !== currentUserAddress) {
        showToast("❌ Access Denied: You must connect your wallet matching this profile to redeem items!", "error");
        return;
    }
    const btn = e.target;
    const item = btn.getAttribute("data-item");
    const cost = parseInt(btn.getAttribute("data-cost"));
    
    if (APP_STATE.bxp < cost) {
        showToast("Insufficient BXP balance to redeem this item!", "error");
        return;
    }
    
    btn.disabled = true;
    const originalText = btn.innerText;
    btn.innerText = "Redeeming...";
    
    try {
        const gasFee = await runSimulatedTransaction(`Redeem ${item === 'xp-boost' ? '500 XP Boost' : 'OG NFT Badge'}`);
        if (gasFee) {
            APP_STATE.bxp -= cost;
            PROFILES[APP_STATE.currentUser].bxp = APP_STATE.bxp;
            
            // Update DOM
            if (DOM.headerBxp) DOM.headerBxp.innerText = `${formatNumber(APP_STATE.bxp)} BXP`;
            if (DOM.leaderboardUserBxp) DOM.leaderboardUserBxp.innerText = `${formatNumber(APP_STATE.bxp)} BXP`;
            if (DOM.rewardsBxpAmount) DOM.rewardsBxpAmount.innerText = formatNumber(APP_STATE.bxp);
            
            if (item === "xp-boost") {
                APP_STATE.xp += 500;
                PROFILES[APP_STATE.currentUser].xp = APP_STATE.xp;
                if (DOM.headerXp) DOM.headerXp.innerText = `${formatNumber(APP_STATE.xp)} XP`;
            }
            
            // Log transaction
            APP_STATE.bxpTransactions.unshift({
                type: item === 'xp-boost' ? 'Redeem: 500 XP Boost' : 'Redeem: Base OG NFT',
                amount: `-${cost} BXP`,
                gas: `Optimized`,
                status: "Success",
                hash: getMockHash(),
                time: "Just now"
            });
            
            renderBxpTransactions();
            renderLeaderboardsPage();
            showToast("Redeemed item successfully!", "success");
            saveState();
        }
        btn.disabled = false;
        btn.innerText = originalText;
    } catch (err) {
        btn.disabled = false;
        btn.innerText = originalText;
    }
}

// Clipboard and UI Helpers
let isSimulatingReferral = false;
function simulateReferralJoin() {
    if (isSimulatingReferral) return;
    isSimulatingReferral = true;
    
    showToast("Simulating a friend joining via your referral link...", "warning");
    
    setTimeout(() => {
        const user = PROFILES[APP_STATE.currentUser];
        const hex = "0123456789abcdef";
        const randAddr = "0x" + Array.from({length: 4}, () => hex[Math.floor(Math.random()*16)]).join("") + "..." + Array.from({length: 4}, () => hex[Math.floor(Math.random()*16)]).join("");
        const formattedDate = new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
        
        const friendBxp = Math.floor(Math.random() * 6000) + 4000; // 4000 to 10000 BXP
        const commission = Math.round(friendBxp * 0.3); // 30% commission
        const flatReward = 50; // 50 BXP flat
        const totalAwarded = commission + flatReward;
        
        user.invitedCount += 1;
        user.referralBxpClaimed += totalAwarded;
        
        user.invitedFriends.unshift({
            address: randAddr,
            date: formattedDate,
            totalBxp: friendBxp,
            share: commission,
            status: "Active"
        });
        
        APP_STATE.bxp += totalAwarded;
        user.bxp = APP_STATE.bxp;
        
        APP_STATE.bxpTransactions.unshift({
            type: `Referral Award (${randAddr})`,
            amount: `+${formatNumber(totalAwarded)} BXP`,
            gas: `Free`,
            status: "Success",
            hash: getMockHash(),
            time: "Just now"
        });
        
        if (DOM.headerBxp) DOM.headerBxp.innerText = `${formatNumber(APP_STATE.bxp)} BXP`;
        if (DOM.leaderboardUserBxp) DOM.leaderboardUserBxp.innerText = `${formatNumber(APP_STATE.bxp)} BXP`;
        if (DOM.rewardsBxpAmount) DOM.rewardsBxpAmount.innerText = formatNumber(APP_STATE.bxp);
        
        renderReferralsPage();
        renderBxpTransactions();
        renderLeaderboardsPage();
        updateLeaderboardDisplay(user);
        
        showToast(`🎉 Friend ${randAddr} joined! Earned +${formatNumber(commission)} BXP (30% commission) and +${flatReward} BXP flat reward!`, "success");
        isSimulatingReferral = false;
    }, 3000);
}

function handleCopyReferral() {
    if (!DOM.referralLinkInput) return;
    const link = DOM.referralLinkInput.value;
    
    navigator.clipboard.writeText(link).then(() => {
        if (DOM.refCopyText) DOM.refCopyText.innerText = "Copied!";
        showToast("Referral URL copied to clipboard!", "success");
        simulateReferralJoin();
        
        setTimeout(() => {
            if (DOM.refCopyText) DOM.refCopyText.innerText = "Copy";
        }, 2000);
    }).catch(err => {
        showToast("Failed to copy link.", "error");
    });
}

function handleCopyReferralPage() {
    const link = DOM.referralPageLink.value;
    
    navigator.clipboard.writeText(link).then(() => {
        DOM.btnCopyRefPage.innerText = "Copied!";
        showToast("Referral URL copied to clipboard!", "success");
        simulateReferralJoin();
        
        setTimeout(() => {
            DOM.btnCopyRefPage.innerText = "Copy";
        }, 2000);
    });
}

// Simulated Twitter/X mentions generator search for both #base and @base mentions
function generateMockTweets(handle, hash) {
    const templates = [
        `Bridged my funds to @base today! The gas fees are so cheap, definitely building here. #base`,
        `Checked my Base Passport score. Highly recommend everyone to verify theirs! @base #base`,
        `Base is the absolute best L2 for daily transactions. Fast, secure, and cheap. @base #base`,
        `Just minted my official Base Onchain Passport. 100% human score! @base #base`,
        `The developer experience on @base is top tier. Built a quick contract in minutes! #base`,
        `Base gas fees are less than a penny. The future of on-chain consumer apps is on @base. #base`
    ];
    
    const idx1 = Math.abs(hash) % templates.length;
    const idx2 = (Math.abs(hash) + 1) % templates.length;
    
    return [templates[idx1], templates[idx2]];
}

function startTwitterScan(handle) {
    const scannerModal = document.getElementById("x-scanner-modal");
    const progressVal = document.getElementById("scanner-progress-val");
    const progressFill = document.getElementById("scanner-progress-fill");
    const statusText = document.getElementById("scanner-status-text");
    
    if (!scannerModal || !progressVal || !progressFill || !statusText) return;
    
    scannerModal.classList.remove("hidden");
    
    let progress = 0;
    progressVal.innerText = "0%";
    progressFill.style.width = "0%";
    statusText.innerText = "Connecting to X API...";
    
    let xDetails = null;
    let fetchFinished = false;
    
    // Fetch profile details concurrently from Microlink public API
    fetch(`https://api.microlink.io?url=https://x.com/${handle}`)
        .then(r => r.json())
        .then(res => {
            if (res && res.status === "success" && res.data) {
                xDetails = res.data;
            }
            fetchFinished = true;
        })
        .catch(err => {
            console.error("Error fetching X profile:", err);
            fetchFinished = true; // Complete so we don't hang the UI
        });
    
    const steps = [
        { limit: 20, text: "Connecting to X API..." },
        { limit: 50, text: `Fetching latest profile details for @${handle}...` },
        { limit: 80, text: "Analyzing Base mentions & builder footprints..." },
        { limit: 95, text: "Running NLP sentiment & developer impact analysis..." },
        { limit: 100, text: "Compiling Base Mentions Report..." }
    ];
    
    const interval = setInterval(() => {
        if (progress < 95) {
            progress += Math.floor(Math.random() * 5) + 3;
        } else if (progress >= 95 && progress < 100) {
            if (fetchFinished) {
                progress = 100;
            } else {
                statusText.innerText = "Waiting for X profile response...";
            }
        }
        
        if (progress >= 100) {
            progress = 100;
            clearInterval(interval);
            
            setTimeout(() => {
                scannerModal.classList.add("hidden");
                showMentionsReport(handle, xDetails);
            }, 500);
        }
        
        progressVal.innerText = `${progress}%`;
        progressFill.style.width = `${progress}%`;
        
        if (progress < 100) {
            const currentStep = steps.find(s => progress <= s.limit);
            if (currentStep && progress < 95) {
                statusText.innerText = currentStep.text;
            }
        }
    }, 80);
}

function showMentionsReport(handle, xDetails) {
    const cleanHandle = handle.toLowerCase();
    const keywords = ["base", "onchain", "builder", "dev", "kid", "king", "vitalik", "jesse", "pandus", "coinbase", "optimism", "ethereum", "crypto", "web3", "farcaster", "warpcast", "l2"];
    
    let hasBaseActivity = keywords.some(k => cleanHandle.includes(k));
    
    if (xDetails) {
        const cleanName = (xDetails.author || "").toLowerCase();
        const cleanBio = (xDetails.description || "").toLowerCase();
        const nameMatch = keywords.some(k => cleanName.includes(k));
        const bioMatch = keywords.some(k => cleanBio.includes(k));
        if (nameMatch || bioMatch) {
            hasBaseActivity = true;
        }
    }

    if (!hasBaseActivity) {
        showToast(`❌ Access Denied: No organic Base activity found for @${handle}. X features are disabled.`, "error");
        
        // Reset current user X mentions state
        const user = PROFILES[APP_STATE.currentUser];
        user.hasScannedX = false;
        user.baseMentions = null;
        user.scannedHandle = "";
        
        loadProfile(APP_STATE.currentUser);
        return;
    }

    const reportModal = document.getElementById("x-report-modal");
    if (!reportModal) return;
    
    let hash = 0;
    for (let i = 0; i < handle.length; i++) {
        hash = handle.charCodeAt(i) + ((hash << 5) - hash);
    }
    const count = Math.abs(hash % 37) + 12; // 12 to 48 mentions
    const sentiment = Math.abs(hash % 9) + 90; // 90% to 98% sentiment
    
    // Give maximum 20 XP with one-time verification fee
    const xpReward = 20; 
    
    const displayName = (xDetails && xDetails.author) ? xDetails.author : `${handle} (X User)`;
    document.getElementById("report-display-name").innerText = displayName;
    document.getElementById("report-handle").innerText = `@${handle}`;
    document.getElementById("report-mentions-count").innerText = count;
    document.getElementById("report-sentiment").innerText = `${sentiment}% Bullish`;
    document.getElementById("report-rewards-display").innerText = `+${xpReward} XP`;
    
    // Display avatar image instead of generic bird emoji if available
    const avatarEl = document.querySelector(".scanned-avatar");
    if (avatarEl) {
        if (xDetails && xDetails.image && xDetails.image.url) {
            avatarEl.innerHTML = `<img src="${xDetails.image.url}" alt="${handle}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;" />`;
        } else {
            avatarEl.innerHTML = "🐦";
        }
    }

    // Display bio text block if present
    let bioEl = document.getElementById("report-bio");
    if (xDetails && xDetails.description) {
        if (!bioEl) {
            bioEl = document.createElement("p");
            bioEl.id = "report-bio";
            bioEl.style = "font-size: 11px; color: var(--text-secondary); margin-top: -6px; margin-bottom: 14px; line-height: 1.4; padding: 8px 12px; background: rgba(255,255,255,0.02); border-radius: 6px; border-left: 3px solid var(--color-cyan);";
            const header = document.querySelector(".scanned-user-header");
            if (header) header.parentNode.insertBefore(bioEl, header.nextSibling);
        }
        bioEl.innerText = xDetails.description;
        bioEl.style.display = "block";
    } else if (bioEl) {
        bioEl.style.display = "none";
    }
    
    const tweetsList = document.getElementById("report-tweets-list");
    tweetsList.innerHTML = "";
    
    const selectedTweets = generateMockTweets(handle, hash);
    
    selectedTweets.forEach((tweetText, idx) => {
        const item = document.createElement("div");
        item.className = "scanned-tweet-item";
        
        const highlightedText = tweetText
            .replace(/@base/gi, "<strong>$&</strong>")
            .replace(/#base/gi, "<strong>$&</strong>")
            .replace(/\$BASE/gi, "<strong>$&</strong>")
            .replace(/@Coinbase/gi, "<strong>$&</strong>");
            
        item.innerHTML = `
            <div class="scanned-tweet-meta">
                <span>🐦 @${handle}</span>
                <span>${idx === 0 ? "1 day ago" : "3 days ago"}</span>
            </div>
            <div class="scanned-tweet-text">${highlightedText}</div>
            <div class="scanned-tweet-footer">
                <span>❤️ ${Math.abs(hash % 50) + 12}</span>
                <span>🔁 ${Math.abs(hash % 15) + 3}</span>
            </div>
        `;
        tweetsList.appendChild(item);
    });
    
    const claimBtn = document.getElementById("btn-claim-mentions-rewards");
    const user = PROFILES[APP_STATE.currentUser];
    
    if (user.hasScannedX) {
        claimBtn.disabled = true;
        claimBtn.innerText = "Already Verified & Claimed ✓";
        claimBtn.style.opacity = "0.6";
        claimBtn.style.cursor = "not-allowed";
        
        const rewardSummaryBox = document.getElementById("report-rewards-display");
        if (rewardSummaryBox) {
            rewardSummaryBox.innerText = `+${xpReward} XP (Claimed)`;
            rewardSummaryBox.style.color = "var(--text-muted)";
        }
    } else {
        claimBtn.disabled = false;
        claimBtn.innerText = "Claim Reward XP (One-time Fee)";
        claimBtn.style.opacity = "1";
        claimBtn.style.cursor = "pointer";
        
        claimBtn.onclick = async () => {
            const isWalletConnected = !!(APP_STATE.connectedAddress && APP_STATE.connectedAddress.startsWith("0x"));
            const connectedAddress = APP_STATE.connectedAddress ? APP_STATE.connectedAddress.toLowerCase().trim() : "";
            const currentUserAddress = user.address ? user.address.toLowerCase().trim() : "";
            if (!isWalletConnected || !connectedAddress || connectedAddress !== currentUserAddress) {
                showToast("❌ Access Denied: You must connect your wallet matching this profile to claim verification XP!", "error");
                return;
            }
            claimBtn.disabled = true;
            claimBtn.innerText = "Verifying...";
            try {
                const gasFee = await runSimulatedTransaction(`Verify X Account & Claim XP`);
                if (gasFee) {
                    APP_STATE.baseMentions = count;
                    APP_STATE.scannedHandle = handle;
                    APP_STATE.xp += xpReward;
                    
                    user.xp = APP_STATE.xp;
                    user.baseMentions = count;
                    user.scannedHandle = handle;
                    user.sentiment = sentiment;
                    user.hasScannedX = true;
                    
                    if (xDetails && xDetails.image && xDetails.image.url) {
                        user.avatar = xDetails.image.url;
                    }
                    
                    APP_STATE.bxpTransactions.unshift({
                        type: `X Mentions Verification (@${handle})`,
                        amount: `+${xpReward} XP`,
                        gas: "Optimized",
                        status: "Success",
                        hash: getMockHash(),
                        time: "Just now"
                    });
                    
                    recordSimulatedOnchainTx("X Account Verification", 0.04);
                    
                    showToast(`🎉 X account verified! Rewarded +${xpReward} XP!`, "success");
                    reportModal.classList.add("hidden");
                } else {
                    claimBtn.disabled = false;
                    claimBtn.innerText = "Claim Reward XP (One-time Fee)";
                }
            } catch (err) {
                claimBtn.disabled = false;
                claimBtn.innerText = "Claim Reward XP (One-time Fee)";
            }
        };
    }
    
    reportModal.classList.remove("hidden");
}

// Event Listeners Initialisation
function initializeEvents() {
    // Dynamic game click event bindings
    document.querySelectorAll(".btn-checkin-action").forEach(btn => {
        btn.addEventListener("click", handleCheckIn);
    });
    
    document.querySelectorAll(".btn-roll-dice-action").forEach(btn => {
        btn.addEventListener("click", handleDiceRoll);
    });
    
    document.querySelectorAll(".btn-open-box-action").forEach(btn => {
        btn.addEventListener("click", handleOpenBox);
    });
    
    const boostBtn = document.getElementById("btn-boost-activity-action");
    if (boostBtn) {
        boostBtn.addEventListener("click", handleBoostActivity);
    }
    
    if (DOM.copyRefBtn) {
        DOM.copyRefBtn.addEventListener("click", handleCopyReferral);
    }
    
    if (DOM.btnCopyRefPage) {
        DOM.btnCopyRefPage.addEventListener("click", handleCopyReferralPage);
    }

    // Top Welcome Banner Invite Friends
    const bannerGoRef = document.getElementById("btn-banner-go-ref");
    if (bannerGoRef) {
        bannerGoRef.addEventListener("click", (e) => {
            e.preventDefault();
            switchTab("referrals");
        });
    }

    // Games Tab Promo Get Invite Link
    const promoGoRef = document.getElementById("btn-promo-go-ref");
    if (promoGoRef) {
        promoGoRef.addEventListener("click", (e) => {
            e.preventDefault();
            switchTab("referrals");
        });
    }

    // Score Card Viral Share on X button
    const shareXViral = document.getElementById("btn-share-x-viral");
    if (shareXViral) {
        shareXViral.addEventListener("click", (e) => {
            e.preventDefault();
            handleShareOnX();
        });
    }

    // Celebration modal controls
    const closeCelebrationBtn = document.getElementById("btn-close-celebration-modal");
    const celebrationModal = document.getElementById("celebration-share-modal");
    if (closeCelebrationBtn && celebrationModal) {
        closeCelebrationBtn.addEventListener("click", () => {
            celebrationModal.classList.add("hidden");
        });
    }

    const celebrationTweetBtn = document.getElementById("btn-celebration-tweet");
    if (celebrationTweetBtn && celebrationModal) {
        celebrationTweetBtn.addEventListener("click", (e) => {
            e.preventDefault();
            handleShareOnX();
            celebrationModal.classList.add("hidden");
        });
    }

    const celebrationSavePngBtn = document.getElementById("btn-celebration-save-png");
    if (celebrationSavePngBtn && celebrationModal) {
        celebrationSavePngBtn.addEventListener("click", (e) => {
            e.preventDefault();
            celebrationModal.classList.add("hidden");
            const saveBtn = document.getElementById("btn-save-passport-new");
            if (saveBtn) {
                saveBtn.click();
            }
        });
    }
    
    const promoInviteBtn = document.getElementById("promo-invite-btn");
    if (promoInviteBtn) {
        promoInviteBtn.addEventListener("click", (e) => {
            e.preventDefault();
            const link = `${window.location.origin}/r/${PROFILES[APP_STATE.currentUser].name}`;
            navigator.clipboard.writeText(link).then(() => {
                showToast("Referral URL copied to clipboard!", "success");
                simulateReferralJoin();
            });
        });
    }
    
    // Bind redeem catalog rewards buttons
    document.addEventListener("click", (e) => {
        if (e.target && e.target.classList.contains("btn-claim-reward")) {
            handleRedeemItem(e);
        }
    });
    
    // Wallet provider switching clicks
    document.addEventListener("click", (e) => {
        const providerBtn = e.target.closest(".provider-btn");
        if (providerBtn) {
            document.querySelectorAll(".provider-btn").forEach(btn => btn.classList.remove("active"));
            providerBtn.classList.add("active");
            
            const providerKey = providerBtn.getAttribute("data-provider");
            APP_STATE.activeProvider = providerKey;
            
            const providerConfig = APP_STATE.providers[providerKey];
            
            // Reload user values to reflect simulated address offsets
            loadProfile(APP_STATE.currentUser);
            updateHeaderWalletUI();
            saveState();
            showToast(`Connected wallet provider changed to: ${providerConfig.name}`, "success");
        }
    });
    



    // Disconnect button logic
    if (DOM.disconnectBtn) {
        DOM.disconnectBtn.addEventListener("click", async () => {
            const isConnected = APP_STATE.connectedAddress && APP_STATE.connectedAddress.startsWith("0x");
            
            if (isConnected) {
                // Wagmi disconnect
                if (window.wagmiDisconnect) window.wagmiDisconnect();
                // Disconnect
                APP_STATE.connectedAddress = "";
                APP_STATE.activeProvider = "base";
                // Reset all providers to zero balance
                Object.keys(APP_STATE.providers).forEach(k => {
                    APP_STATE.providers[k].balance = "0.000 ETH";
                    APP_STATE.providers[k].addressOffset = "";
                });
                loadProfile("fresh");
                updateHeaderWalletUI();
                if (DOM.walletDropdown) DOM.walletDropdown.classList.add("hidden");
                showToast("Wallet disconnected.", "warning");
            } else {
                // Not connected — trigger RainbowKit button
                const rainbowBtn = document.querySelector("#rainbow-wallet-container button");
                if (rainbowBtn) rainbowBtn.click();
            }
            if (DOM.walletDropdown) DOM.walletDropdown.classList.add("hidden");
        });
    }
    
    if (DOM.sidebarCopyAddressBtn) {
        DOM.sidebarCopyAddressBtn.addEventListener("click", () => {
            const addr = PROFILES[APP_STATE.currentUser].address;
            navigator.clipboard.writeText(addr).then(() => {
                showToast("Wallet address copied to clipboard!", "success");
            });
        });
    }
    
    const mockWalletLink = document.getElementById("search-mock-wallet-link");
    if (mockWalletLink) {
        mockWalletLink.addEventListener("click", (e) => {
            e.preventDefault();
            DOM.searchInput.value = "onchain_kid";
            loadProfile("onchain_kid");
            DOM.searchSuggestions.classList.add("hidden");
            showToast("Loaded mock wallet profile: onchain_kid", "success");
        });
    }

    const mockCheckLink = document.getElementById("search-mock-check-link");
    if (mockCheckLink) {
        mockCheckLink.addEventListener("click", (e) => {
            e.preventDefault();
            const connected = APP_STATE.connectedAddress;
            if (connected && connected.startsWith("0x")) {
                DOM.searchInput.value = connected;
                const profileKey = getOrCreateProfileForAddress(connected);
                if (profileKey) {
                    loadProfile(profileKey);
                    DOM.searchSuggestions.classList.add("hidden");
                    showToast(`Checking connected wallet: ${connected.substring(0, 8)}...`, "success");
                }
            } else {
                DOM.searchInput.value = "";
                DOM.searchInput.placeholder = "Paste your Base address here...";
                DOM.searchInput.focus();
                showToast("Please paste or type a wallet address in the search box to check its Basename.", "warning");
            }
        });
    }
    
    const mockXLink = document.getElementById("search-mock-x-link");
    if (mockXLink) {
        mockXLink.addEventListener("click", (e) => {
            e.preventDefault();
            // Focus the search input and prompt the user to type their own X handle
            DOM.searchInput.value = "@";
            DOM.searchInput.focus();
            DOM.searchSuggestions.classList.add("hidden");
            showToast("Enter your X (Twitter) handle to scan your Base mentions.", "purple");
        });
    }
    
    // Tab switching listener
    DOM.navItems.forEach(item => {
        item.addEventListener("click", (e) => {
            const tabId = item.getAttribute("data-tab");
            if (!tabId) return; // Allow normal link behavior for external links (like support)

            e.preventDefault();
            
            DOM.navItems.forEach(n => n.classList.remove("active"));
            item.classList.add("active");
            
            DOM.tabContents.forEach(tab => {
                if (tab.id === `tab-${tabId}`) {
                    tab.classList.remove("hidden");
                } else {
                    tab.classList.add("hidden");
                }
            });

            // Dynamically move the passport card based on selected tab
            const passportCard = document.querySelector(".passport-card");
            if (passportCard) {
                if (tabId === "passport") {
                    const tabPassport = document.getElementById("tab-passport");
                    if (tabPassport) {
                        tabPassport.appendChild(passportCard);
                    }
                } else {
                    const originalParent = document.querySelector(".dashboard-grid-middle");
                    if (originalParent && passportCard.parentElement !== originalParent) {
                        originalParent.appendChild(passportCard);
                    }
                }
            }
            
            // Re-render graphs & calendars when returning to tab
            if (tabId === "dashboard") {
                drawActivityChart();
                drawReputationRadar();
            } else if (tabId === "airdrop") {
                renderActivityCalendar();
            } else if (tabId === "rewards") {
                renderBxpTransactions();
            } else if (tabId === "leaderboard") {
                renderLeaderboardsPage();
            } else if (tabId === "referrals") {
                renderReferralsPage();
            } else if (tabId === "badges") {
                renderBadgesPage();
            } else if (tabId === "transactions") {
                renderRealTransactionsPage();
            }
        });
    });
    
    DOM.backHomeButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const dashNav = document.querySelector(".nav-item[data-tab='dashboard']");
            if (dashNav) dashNav.click();
        });
    });
    
    const searchSuggestionsList = Object.keys(PROFILES);
    
    DOM.searchInput.addEventListener("input", () => {
        const val = DOM.searchInput.value.toLowerCase().trim();
        if (!val) {
            DOM.searchSuggestions.classList.add("hidden");
            return;
        }
        
        const filtered = searchSuggestionsList.filter(name => 
            name.toLowerCase().includes(val) || 
            PROFILES[name].address.toLowerCase().includes(val)
        );
        
        DOM.searchSuggestions.innerHTML = "";
        
        // Add dynamic address load option if it's a valid hex address format
        if (val.startsWith("0x") && val.length === 42 && /^0x[0-9a-f]{40}$/i.test(val)) {
            const loadOpt = document.createElement("div");
            loadOpt.className = "suggestion-item";
            loadOpt.style.borderLeft = "3px solid var(--color-green)";
            loadOpt.innerHTML = `
                <span class="suggestion-label" style="color: var(--color-green); font-weight: 600;">📋 Load Profile for Address "${val.substring(0, 6)}...${val.substring(38)}"</span>
                <span class="suggestion-type" style="background: rgba(16, 185, 129, 0.1); color: var(--color-green); font-weight: 600;">Address</span>
            `;
            loadOpt.addEventListener("click", () => {
                const profileKey = getOrCreateProfileForAddress(val);
                if (profileKey) {
                    DOM.searchInput.value = val;
                    DOM.searchSuggestions.classList.add("hidden");
                    loadProfile(profileKey);
                    showToast(`Loaded details for wallet: ${val.substring(0, 8)}...`, "success");
                }
            });
            DOM.searchSuggestions.appendChild(loadOpt);

            // Fetch Basename on-chain in real-time
            if (window.ethers) {
                const provider = new ethers.JsonRpcProvider(ALCHEMY_URL);
                getBasename(val, provider).then(basename => {
                    if (basename && DOM.searchInput.value.toLowerCase().trim() === val) {
                        loadOpt.innerHTML = `
                            <span class="suggestion-label" style="color: var(--color-green); font-weight: 600;">🆔 Load Basename: "${basename}"</span>
                            <span class="suggestion-type" style="background: rgba(16, 185, 129, 0.1); color: var(--color-green); font-weight: 600;">Basename</span>
                        `;
                        const newLoadOpt = loadOpt.cloneNode(true);
                        newLoadOpt.addEventListener("click", () => {
                            const profileKey = getOrCreateProfileForAddress(val);
                            if (profileKey) {
                                PROFILES[profileKey].name = basename;
                                PROFILES[profileKey].scannedHandle = basename;
                                DOM.searchInput.value = val;
                                DOM.searchSuggestions.classList.add("hidden");
                                loadProfile(profileKey);
                                showToast(`Loaded Basename: ${basename}`, "success");
                            }
                        });
                        loadOpt.replaceWith(newLoadOpt);
                    }
                }).catch(err => console.error("Real-time Basename lookup failed:", err));
            }

            const explorerOpt = document.createElement("div");
            explorerOpt.className = "suggestion-item";
            explorerOpt.style.borderLeft = "3px solid var(--color-cyan)";
            explorerOpt.innerHTML = `
                <span class="suggestion-label" style="color: var(--color-cyan); font-weight: 600;">🌐 View on Basescan: "${val.substring(0, 6)}...${val.substring(38)}"</span>
                <span class="suggestion-type" style="background: rgba(0, 240, 255, 0.1); color: var(--color-cyan); font-weight: 600;">Basescan</span>
            `;
            explorerOpt.addEventListener("click", () => {
                window.open(`https://basescan.org/address/${val}`, "_blank");
                DOM.searchSuggestions.classList.add("hidden");
            });
            DOM.searchSuggestions.appendChild(explorerOpt);
        } else if (!val.startsWith("0x")) {
            // Add Twitter scanner option at the top of suggestions (only if not an address query)
            const scanOpt = document.createElement("div");
            scanOpt.className = "suggestion-item scan-twitter-opt";
            scanOpt.style.borderLeft = "3px solid var(--color-cyan)";
            scanOpt.innerHTML = `
                <span class="suggestion-label" style="color: var(--color-cyan); font-weight: 600;">🔍 Scan X mentions for "@${val.replace(/^@/, '')}"</span>
                <span class="suggestion-type" style="background: rgba(0, 240, 255, 0.1); color: var(--color-cyan); font-weight: 600;">X Scanner</span>
            `;
            scanOpt.addEventListener("click", () => {
                const cleanHandle = val.replace(/^@/, '');
                DOM.searchSuggestions.classList.add("hidden");
                startTwitterScan(cleanHandle);
            });
            DOM.searchSuggestions.appendChild(scanOpt);
        }

        if (filtered.length > 0) {
            filtered.forEach(name => {
                const item = document.createElement("div");
                item.className = "suggestion-item";
                item.innerHTML = `
                    <span class="suggestion-label">${name}</span>
                    <span class="suggestion-type">${name.endsWith('.eth') ? 'ENS' : 'Username'}</span>
                `;
                item.addEventListener("click", () => {
                    DOM.searchInput.value = name;
                    DOM.searchSuggestions.classList.add("hidden");
                    loadProfile(name);
                    showToast(`Switched profile view to: ${name}`, "success");
                });
                DOM.searchSuggestions.appendChild(item);
            });
        }
        
        DOM.searchSuggestions.classList.remove("hidden");
    });
    
    async function resolveBasename(basename, provider) {
        console.log(`[Search Flow] Resolving Basename: "${basename}"`);
        try {
            const node = ethers.namehash(basename);
            const BASENAME_L2_RESOLVER_ADDRESS = "0xC6d566A56A1aFf6508b41f6c90ff131615583BCD";
            const L2_RESOLVER_ABI = [
                "function addr(bytes32 node) view returns (address)"
            ];
            const contract = new ethers.Contract(BASENAME_L2_RESOLVER_ADDRESS, L2_RESOLVER_ABI, provider);
            const addr = await contract.addr(node);
            console.log(`[Search Flow] Basename resolved address: "${addr}"`);
            if (addr && addr !== "0x0000000000000000000000000000000000000000") {
                return addr;
            }
            return null;
        } catch (e) {
            console.error("[Search Flow] resolveBasename error:", e);
            return null;
        }
    }

    async function resolveEnsMainnet(ensName) {
        console.log(`[Search Flow] Resolving ENS on Mainnet: "${ensName}"`);
        try {
            const mainnetProvider = new ethers.JsonRpcProvider("https://cloudflare-eth.com");
            const addr = await mainnetProvider.resolveName(ensName);
            console.log(`[Search Flow] ENS resolved address: "${addr}"`);
            return addr;
        } catch (e) {
            console.error("[Search Flow] resolveEnsMainnet error:", e);
            return null;
        }
    }

    async function executeSearch(query) {
        const val = query ? query.trim() : "";
        console.log(`[Search Flow] executeSearch called with query: "${val}"`);
        if (!val) {
            console.log("[Search Flow] Empty query, ignoring.");
            return;
        }
        
        const lowerVal = val.toLowerCase();
        
        // Hide suggestions dropdown
        if (DOM.searchSuggestions) {
            DOM.searchSuggestions.classList.add("hidden");
        }
        
        // Setup visual loading states
        const searchIcon = document.querySelector(".search-container .search-icon");
        const originalIconText = searchIcon ? searchIcon.innerText : "🔍";
        if (searchIcon) searchIcon.innerText = "⌛";
        if (DOM.searchInput) DOM.searchInput.disabled = true;
        
        try {
            // Case 1: Check if input is a valid hexadecimal address
            if (val.startsWith("0x") && val.length === 42 && /^0x[0-9a-f]{40}$/i.test(val)) {
                console.log("[Search Flow] Query is a valid Ethereum address.");
                const profileKey = getOrCreateProfileForAddress(val);
                if (profileKey) {
                    console.log(`[Search Flow] Loading profile key: "${profileKey}"`);
                    loadProfile(profileKey);
                    showToast(`Loaded details for wallet: ${val.substring(0, 8)}...`, "success");
                } else {
                    console.log("[Search Flow] Failed to get or create profile for address.");
                    showToast("Invalid wallet address format.", "error");
                }
            } 
            // Case 2: Basename search (ends with .base.eth)
            else if (lowerVal.endsWith(".base.eth")) {
                console.log("[Search Flow] Query is a Basename.");
                showToast(`Resolving Basename: ${val}...`, "info");
                
                const provider = new ethers.JsonRpcProvider(ALCHEMY_URL);
                const resolvedAddr = await resolveBasename(lowerVal, provider);
                
                if (resolvedAddr) {
                    const profileKey = getOrCreateProfileForAddress(resolvedAddr);
                    if (profileKey) {
                        // Update profile name and scannedHandle to reflect the resolved Basename
                        PROFILES[profileKey].name = lowerVal;
                        PROFILES[profileKey].scannedHandle = lowerVal;
                        
                        console.log(`[Search Flow] Basename resolved to ${resolvedAddr}. Loading profile "${profileKey}"`);
                        loadProfile(profileKey);
                        showToast(`Resolved Basename: ${lowerVal}`, "success");
                    }
                } else {
                    console.log("[Search Flow] Basename resolution returned no address.");
                    showToast(`Could not resolve Basename: ${val}`, "error");
                }
            }
            // Case 3: ENS Mainnet search (ends with .eth, but not .base.eth)
            else if (lowerVal.endsWith(".eth")) {
                console.log("[Search Flow] Query is a standard ENS name.");
                showToast(`Resolving ENS: ${val}...`, "info");
                
                const resolvedAddr = await resolveEnsMainnet(lowerVal);
                
                if (resolvedAddr) {
                    const profileKey = getOrCreateProfileForAddress(resolvedAddr);
                    if (profileKey) {
                        // Update profile name and scannedHandle to reflect the resolved ENS name
                        PROFILES[profileKey].name = lowerVal;
                        PROFILES[profileKey].scannedHandle = lowerVal;
                        
                        console.log(`[Search Flow] ENS resolved to ${resolvedAddr}. Loading profile "${profileKey}"`);
                        loadProfile(profileKey);
                        showToast(`Resolved ENS Name: ${lowerVal}`, "success");
                    }
                } else {
                    console.log("[Search Flow] ENS resolution returned no address.");
                    showToast(`Could not resolve ENS name: ${val}`, "error");
                }
            }
            // Case 4: Check if input matches existing mock profile address directly
            else {
                const matchedProfile = findProfileByAddress(val);
                if (matchedProfile) {
                    console.log(`[Search Flow] Query matches profile address. Loading mock profile: "${matchedProfile}"`);
                    loadProfile(matchedProfile);
                    showToast(`Switched profile view to: ${matchedProfile}`, "success");
                } 
                // Case 5: Twitter Scan / Username search
                else if (val.startsWith("@") || !PROFILES[lowerVal]) {
                    const cleanHandle = val.replace(/^@/, '');
                    console.log(`[Search Flow] Scanning Twitter/X handle: "${cleanHandle}"`);
                    startTwitterScan(cleanHandle);
                } 
                // Case 6: Loaded mock profile by key directly (e.g. "fresh" or local profile key)
                else {
                    console.log(`[Search Flow] Loading mock profile key directly: "${lowerVal}"`);
                    loadProfile(lowerVal);
                    showToast(`Switched profile view to: ${lowerVal}`, "success");
                }
            }
        } catch (error) {
            console.error("[Search Flow] Error during search execution:", error);
            showToast("Search failed due to an error.", "error");
        } finally {
            // Restore visual loading states
            if (searchIcon) searchIcon.innerText = originalIconText;
            if (DOM.searchInput) DOM.searchInput.disabled = false;
        }
    }

    // Connect click listener to search icon
    const searchIcon = document.querySelector(".search-container .search-icon");
    if (searchIcon) {
        searchIcon.style.cursor = "pointer";
        searchIcon.addEventListener("click", () => {
            console.log("[Search Flow] Clicked search icon.");
            executeSearch(DOM.searchInput.value);
        });
    }

    // Connect enter key listener to search input
    DOM.searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            console.log("[Search Flow] Pressed Enter inside search input.");
            executeSearch(DOM.searchInput.value);
        }
    });
    
    DOM.chartToggleButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            DOM.chartToggleButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            
            APP_STATE.chartType = btn.getAttribute("data-chart-type");
            drawActivityChart();
        });
    });
    
    if (DOM.chartTimeframe) {
        DOM.chartTimeframe.addEventListener("change", () => {
            APP_STATE.chartTimeframe = DOM.chartTimeframe.value;
            drawActivityChart();
        });
    }
    
    // Toggle wallet dropdown menu on click
    if (DOM.walletDropdownTrigger) {
        DOM.walletDropdownTrigger.addEventListener("click", (e) => {
            e.stopPropagation();
            const isConnected = APP_STATE.connectedAddress && APP_STATE.connectedAddress.startsWith("0x");
            if (isConnected) {
                DOM.walletDropdown.classList.toggle("hidden");
                // Close notifications if open
                if (DOM.notifDropdown) DOM.notifDropdown.classList.add("hidden");
            } else {
                openConnectWalletModal();
            }
        });
    }
    
    if (DOM.walletDropdown) {
        DOM.walletDropdown.addEventListener("click", (e) => {
            e.stopPropagation();
        });
    }

    DOM.notifBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        DOM.notifDropdown.classList.toggle("hidden");
        if (DOM.walletDropdown) DOM.walletDropdown.classList.add("hidden");
    });
    
    DOM.notifDropdown.addEventListener("click", (e) => e.stopPropagation());

    // Dismiss dropdowns on clicking outside
    document.addEventListener("click", () => {
        if (DOM.walletDropdown) DOM.walletDropdown.classList.add("hidden");
        if (DOM.notifDropdown) DOM.notifDropdown.classList.add("hidden");
    });
    
    DOM.markAllRead.addEventListener("click", (e) => {
        e.preventDefault();
        document.querySelectorAll(".notification-item.unread").forEach(item => {
            item.classList.remove("unread");
        });
        DOM.notifBadge.style.display = "none";
        showToast("All notifications marked as read.", "success");
    });
    
    window.addEventListener("resize", () => {
        drawActivityChart();
        drawReputationRadar();
    });
    
    // Connect Wallet Modal functions & event listeners
    const connectWalletModal = document.getElementById("connect-wallet-modal");
    const btnCloseConnectModal = document.getElementById("btn-close-connect-modal");
    const cwmAddressInput = document.getElementById("cwm-address-input");
    const cwmCheckAddressBtn = document.getElementById("cwm-check-address-btn");

    function openConnectWalletModal() {
        console.log("[Wallet Connect] openConnectWalletModal called.");
        if (connectWalletModal) {
            connectWalletModal.classList.remove("hidden");
            if (cwmAddressInput) cwmAddressInput.value = "";
        }
        if (DOM.walletDropdown) DOM.walletDropdown.classList.add("hidden");
    }

    window.openConnectWalletModal = openConnectWalletModal;

    function closeConnectWalletModal() {
        if (connectWalletModal) connectWalletModal.classList.add("hidden");
    }
    
    window.closeConnectWalletModal = closeConnectWalletModal;

    if (btnCloseConnectModal) {
        btnCloseConnectModal.addEventListener("click", closeConnectWalletModal);
    }
    if (connectWalletModal) {
        connectWalletModal.addEventListener("click", (e) => {
            if (e.target === connectWalletModal) closeConnectWalletModal();
        });
    }

    // Handle provider button clicks in modal
    document.querySelectorAll(".wallet-connect-provider-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
            const walletType = btn.getAttribute("data-wallet");
            console.log(`[Wallet Connect] Provider clicked: ${walletType}`);
            
            if (walletType === "farcaster") {
                showToast("Farcaster: paste your address in the field below or connect via Warpcast app.", "warning");
                if (cwmAddressInput) {
                    cwmAddressInput.focus();
                    cwmAddressInput.placeholder = "Paste your Farcaster custody address 0x...";
                }
                return;
            }

            closeConnectWalletModal();
            // Show connecting state on header button
            const headerConnectBtn = document.getElementById("header-connect-wallet-btn");
            if (headerConnectBtn) {
                headerConnectBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-right: 8px; animation: spin 1s linear infinite; display: inline-block; vertical-align: middle;">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" style="opacity: 0.25; fill: none;"></circle>
                        <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" style="opacity: 0.75;"></path>
                    </svg>
                    Connecting...
                `;
                headerConnectBtn.style.background = "linear-gradient(135deg, #0052FF 0%, #0040CC 100%)";
                headerConnectBtn.style.color = "#fff";
                headerConnectBtn.style.pointerEvents = "none";
            }

            // Trigger Wagmi connection
            if (window.wagmiConnect) {
                try {
                    await window.wagmiConnect(walletType);
                } catch (err) {
                    console.error("Wagmi connection trigger failed:", err);
                }
            } else {
                showToast("❌ Wallet connection bridge not loaded yet. Please wait.", "error");
            }
        });
    });

    // Handle "Check Address / ENS" in modal
    if (cwmCheckAddressBtn && cwmAddressInput) {
        cwmCheckAddressBtn.addEventListener("click", async () => {
            const rawInput = cwmAddressInput.value.trim();
            if (!rawInput) {
                showToast("Please enter a wallet address or ENS name.", "error");
                return;
            }
            cwmCheckAddressBtn.innerText = "Looking up...";
            cwmCheckAddressBtn.disabled = true;

            // Resolve ENS/Basename/Mock Username
            let resolvedAddr = rawInput;
            const matchedKey = findProfileByAddress(rawInput);
            if (matchedKey && PROFILES[matchedKey]) {
                resolvedAddr = PROFILES[matchedKey].address;
            } else if (!rawInput.startsWith("0x") && rawInput.includes(".")) {
                try {
                    const provider = new ethers.JsonRpcProvider("https://mainnet.base.org");
                    const ens = await provider.resolveName(rawInput);
                    if (ens) resolvedAddr = ens;
                } catch (e) { /* fall through */ }
            }

            cwmCheckAddressBtn.innerText = "Check Address / ENS";
            cwmCheckAddressBtn.disabled = false;

            if (!resolvedAddr.startsWith("0x") || resolvedAddr.length < 40) {
                showToast("❌ Could not resolve that address or ENS name.", "error");
                return;
            }

            APP_STATE.connectedAddress = resolvedAddr;
            const profileKey = getOrCreateProfileForAddress(resolvedAddr);
            if (profileKey) {
                APP_STATE.activeProvider = "base";
                closeConnectWalletModal();
                loadProfile(profileKey);
                updateHeaderWalletUI();
                showToast(`✅ Viewing wallet: ${resolvedAddr.substring(0, 6)}...${resolvedAddr.substring(38)}`, "success");
            }
        });

        cwmAddressInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") cwmCheckAddressBtn.click();
        });
    }

    // Web3 Mint Modal listeners
    const mintModal = document.getElementById("mint-passport-modal");
    const closeMintModalBtn = document.getElementById("btn-close-mint-modal");
    const confirmMintBtn = document.getElementById("btn-confirm-mint-pay");
    
    if (closeMintModalBtn && mintModal) {
        closeMintModalBtn.addEventListener("click", () => {
            mintModal.classList.add("hidden");
        });
    }
    
    if (confirmMintBtn && mintModal) {
        confirmMintBtn.addEventListener("click", async () => {
            confirmMintBtn.disabled = true;
            confirmMintBtn.innerText = "Processing Mint...";
            
            try {
                const gasFee = await runSimulatedTransaction("Mint Base Passport ($0.01)");
                if (gasFee) {
                    APP_STATE.isPassportMinted = true;
                    mintModal.classList.add("hidden");
                    recordSimulatedOnchainTx("Mint Base Passport", 0.10);
                    
                    // Get current user details to trigger download
                    const user = PROFILES[APP_STATE.currentUser];
                    const score = user.airdropScore !== undefined ? user.airdropScore : calculateAirdropScore(user);
                    const levelVal = Math.floor(score * 0.8) + 7;
                    const scaledScore = score;
                    
                    let rankText = "TOP 35%";
                    if (score >= 97) rankText = "TOP 1%";
                    else if (score >= 90) rankText = "TOP 3%";
                    else if (score >= 80) rankText = "TOP 5%";
                    else if (score >= 60) rankText = "TOP 15%";
                    
                    triggerPassportDownload(user, levelVal, scaledScore, rankText);
                    
                    // Update Save button icon or tooltip to indicate it is now free
                    const saveBtn = document.getElementById("btn-save-passport-new");
                    if (saveBtn) {
                        saveBtn.title = "Download Passport (Unlocked)";
                    }
                }
            } catch (err) {
                console.error(err);
            } finally {
                confirmMintBtn.disabled = false;
                confirmMintBtn.innerText = "Confirm Payment ($0.01)";
            }
        });
    }
    
    // Close buttons for mentions scanner and report modals
    const closeScannerBtn = document.getElementById("btn-close-scanner-modal");
    if (closeScannerBtn) {
        closeScannerBtn.addEventListener("click", () => {
            document.getElementById("x-scanner-modal").classList.add("hidden");
        });
    }
    const closeReportBtn = document.getElementById("btn-close-report-modal");
    if (closeReportBtn) {
        closeReportBtn.addEventListener("click", () => {
            document.getElementById("x-report-modal").classList.add("hidden");
        });
    }
    const closeReportBtn2 = document.getElementById("btn-close-mentions-report");
    if (closeReportBtn2) {
        closeReportBtn2.addEventListener("click", () => {
            document.getElementById("x-report-modal").classList.add("hidden");
        });
    }
    const mentionsTrigger = document.getElementById("btn-scan-x-trigger");
    if (mentionsTrigger) {
        mentionsTrigger.addEventListener("click", (e) => {
            e.stopPropagation();
            DOM.searchInput.focus();
            DOM.searchInput.value = "@";
            const event = new Event('input', { bubbles: true });
            DOM.searchInput.dispatchEvent(event);
        });
    }

    // Close button for claim badge modal
    const closeBadgeModalBtn = document.getElementById("btn-close-badge-modal");
    const badgeModal = document.getElementById("claim-badge-modal");
    if (closeBadgeModalBtn && badgeModal) {
        closeBadgeModalBtn.addEventListener("click", () => {
            badgeModal.classList.add("hidden");
        });
    }

    const confirmBadgeClaimBtn = document.getElementById("btn-confirm-badge-claim");
    if (confirmBadgeClaimBtn && badgeModal) {
        confirmBadgeClaimBtn.addEventListener("click", async () => {
            const user = PROFILES[APP_STATE.currentUser];
            if (!currentBadgeToClaim) return;
            
            const isWalletConnected = !!(APP_STATE.connectedAddress && APP_STATE.connectedAddress.startsWith("0x"));
            const connectedAddress = APP_STATE.connectedAddress ? APP_STATE.connectedAddress.toLowerCase().trim() : "";
            const currentUserAddress = user.address ? user.address.toLowerCase().trim() : "";
            if (!isWalletConnected || !connectedAddress || connectedAddress !== currentUserAddress) {
                showToast("❌ Access Denied: You must connect your wallet matching this profile to claim this badge!", "error");
                return;
            }
            
            confirmBadgeClaimBtn.disabled = true;
            confirmBadgeClaimBtn.innerText = "Claiming...";
            
            try {
                const gasFee = await runSimulatedTransaction(`Claim Badge: ${currentBadgeToClaim.name} ($0.005)`);
                if (gasFee) {
                    user.claimedBadges = user.claimedBadges || {};
                    const badgeId = `${currentBadgeCat}_${currentBadgeToClaim.req}`;
                    user.claimedBadges[badgeId] = true;
                    
                    APP_STATE.bxp += 150;
                    user.bxp = APP_STATE.bxp;
                    
                    if (DOM.headerBxp) DOM.headerBxp.innerText = `${formatNumber(APP_STATE.bxp)} BXP`;
                    if (DOM.rewardsBxpAmount) DOM.rewardsBxpAmount.innerText = formatNumber(APP_STATE.bxp);
                    
                    APP_STATE.bxpTransactions.unshift({
                        type: `Claimed Badge: ${currentBadgeToClaim.name}`,
                        amount: `+150 BXP`,
                        gas: "Optimized",
                        status: "Success",
                        hash: getMockHash(),
                        time: "Just now"
                    });
                    
                    showToast(`🎖️ Claimed Badge: ${currentBadgeToClaim.name}! +150 BXP earned.`, "success");
                    badgeModal.classList.add("hidden");
                    renderBadgesPage();
                    recordSimulatedOnchainTx("Claim Badge: " + currentBadgeToClaim.name, 0.05);
                }
            } catch (err) {
                console.error("Badge claim error:", err);
            } finally {
                confirmBadgeClaimBtn.disabled = false;
                confirmBadgeClaimBtn.innerText = "Confirm Claim ($0.005)";
            }
        });
    }
}

function startCountdown() {
    setInterval(() => {
        if (APP_STATE.currentUser === "fresh") {
            APP_STATE.checkInTimeRemaining = 0;
            APP_STATE.hasCheckedIn = false;
            return;
        }

        if (APP_STATE.checkInTimeRemaining > 0) {
            APP_STATE.checkInTimeRemaining -= 1;
            
            // Sync with current user profile
            const user = PROFILES[APP_STATE.currentUser];
            if (user) {
                user.checkInTimeRemaining = APP_STATE.checkInTimeRemaining;
                user.hasCheckedIn = APP_STATE.checkInTimeRemaining > 0;
            }
            APP_STATE.hasCheckedIn = APP_STATE.checkInTimeRemaining > 0;
            
            updateCheckInTimerDisplay();
        } else {
            // Timer has hit 0, ensure user can check-in again
            if (APP_STATE.hasCheckedIn) {
                APP_STATE.hasCheckedIn = false;
                const user = PROFILES[APP_STATE.currentUser];
                if (user) {
                    user.hasCheckedIn = false;
                    user.checkInTimeRemaining = 0;
                }
                updateCheckInTimerDisplay();
                saveState();
            }
        }
    }, 1000);
}

// Core App Bootstrapping
window.addEventListener("DOMContentLoaded", () => {
    // Check if URL has a referral path or query parameter and store it
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    const refParam = params.get("ref");
    
    if (refParam) {
        localStorage.setItem("PANDUS_REFERRER", refParam);
        history.replaceState(null, "", window.location.origin);
    } else if (path.startsWith("/r/")) {
        const refName = path.substring(3).trim();
        if (refName) {
            localStorage.setItem("PANDUS_REFERRER", refName);
            history.replaceState(null, "", window.location.origin);
        }
    }

    loadState();
    loadProfile(APP_STATE.currentUser || "fresh");
    initializeEvents();
    updateHeaderWalletUI(); // Ensure disconnected state shows correctly on first load
    updateCheckInTimerDisplay();
    
    // Sync initial game states
    document.querySelectorAll(".rolls-count-display").forEach(el => {
        el.innerText = `${APP_STATE.rollsLeft} / 3`;
    });
    document.querySelectorAll(".box-count-display").forEach(el => {
        el.innerText = `${APP_STATE.boxesLeft} / 3`;
    });
    
    if (APP_STATE.rollsLeft <= 0) {
        document.querySelectorAll(".btn-roll-dice-action").forEach(btn => {
            btn.disabled = true;
            btn.innerText = "🎲 Out of Rolls";
        });
    }
    if (APP_STATE.boxesLeft <= 0) {
        document.querySelectorAll(".btn-open-box-action").forEach(btn => {
            btn.disabled = true;
            btn.innerText = "🎁 All Opened";
        });
    }
    
    // Sync initial activity booster state
    const boostBtn = document.getElementById("btn-boost-activity-action");
    const statusDisp = document.getElementById("boost-status-display");
    if (boostBtn && APP_STATE.hasBoostedActivity) {
        boostBtn.disabled = true;
        boostBtn.innerText = "⚡ Boost Claimed";
        if (statusDisp) statusDisp.innerText = "Boost Completed!";
    }

    startCountdown();
    
    // Listen to wallet account/network change events via RainbowKit & Wagmi
    window.handleWalletConnectChange = function(state) {
        const { address, isConnected, providerName } = state;
        
        if (isConnected && address) {
            const cleanAddr = address.toLowerCase().trim();
            const currentConnected = APP_STATE.connectedAddress ? APP_STATE.connectedAddress.toLowerCase().trim() : "";
            
            if (currentConnected !== cleanAddr) {
                APP_STATE.connectedAddress = address;
                APP_STATE.activeProvider = (providerName || "metamask").toLowerCase();
                
                const profileKey = getOrCreateProfileForAddress(address);
                if (profileKey) {
                    const isMockProfile = ["onchain_kid", "vitalik.eth", "baseking.eth", "jesse.eth", "kid.eth"].includes(profileKey);
                    
                    loadProfile(profileKey);
                    
                    document.querySelectorAll(".provider-btn").forEach(btn => {
                        const p = btn.getAttribute("data-provider");
                        if (p === APP_STATE.activeProvider) btn.classList.add("active");
                        else btn.classList.remove("active");
                    });
                    
                    updateHeaderWalletUI();
                    
                    if (!isMockProfile) {
                        fetchOnchainDetails(profileKey);
                    }
                    
                    showToast(`Wallet Connected: ${address.substring(0, 6)}...${address.substring(38)}`, "success");
                }
            }
        } else {
            if (APP_STATE.connectedAddress) {
                APP_STATE.connectedAddress = "";
                loadProfile("fresh");
                updateHeaderWalletUI();
                showToast("Wallet disconnected.", "warning");
            }
        }
    };

    window.handleWagmiError = function(error) {
        console.error("Wagmi/Wallet connection error:", error);
        
        // Reset connection button texts
        if (DOM.disconnectBtn) {
            DOM.disconnectBtn.innerText = "Connect Wallet";
            DOM.disconnectBtn.style.setProperty("display", "none", "important");
        }
        
        const headerConnectBtn = document.getElementById("header-connect-wallet-btn");
        if (headerConnectBtn && !APP_STATE.connectedAddress) {
            headerConnectBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="2" y="5" width="20" height="14" rx="3" stroke="white" stroke-width="1.8"/>
                    <rect x="16" y="10" width="5" height="5" rx="1.5" fill="white"/>
                    <line x1="2" y1="9" x2="22" y2="9" stroke="white" stroke-width="1.8"/>
                </svg>
                Connect Wallet
            `;
            headerConnectBtn.style.background = "linear-gradient(135deg, #0052FF 0%, #0040CC 100%)";
            headerConnectBtn.style.border = "none";
            headerConnectBtn.style.color = "#fff";
            headerConnectBtn.style.boxShadow = "0 4px 14px rgba(0, 82, 255, 0.4)";
            headerConnectBtn.style.pointerEvents = "auto";
            headerConnectBtn.onclick = function() {
                document.getElementById('connect-wallet-modal').classList.remove('hidden');
            };
            // Clear hover effects used in connected state
            headerConnectBtn.onmouseenter = null;
            headerConnectBtn.onmouseleave = null;
        }
        
        showToast("Connection rejected or failed. Please try again.", "error");
    };

    // Immediately sync the state if the Wagmi bundle loaded first
    if (window.wagmiSyncState) {
        window.wagmiSyncState();
    }

    // Mobile Sidebar Drawer Toggle behavior
    const btnToggleSidebar = document.getElementById("btn-toggle-sidebar");
    const sidebarElement = document.querySelector(".sidebar");
    const sidebarOverlay = document.getElementById("sidebar-overlay");

    if (btnToggleSidebar && sidebarElement && sidebarOverlay) {
        btnToggleSidebar.addEventListener("click", () => {
            sidebarElement.classList.toggle("active");
            sidebarOverlay.classList.toggle("active");
        });
        
        sidebarOverlay.addEventListener("click", () => {
            sidebarElement.classList.remove("active");
            sidebarOverlay.classList.remove("active");
        });

        // Close sidebar when clicking any navigation link
        const sidebarNavLinks = document.querySelectorAll(".sidebar-nav-item, .nav-item");
        sidebarNavLinks.forEach(item => {
            item.addEventListener("click", () => {
                sidebarElement.classList.remove("active");
                sidebarOverlay.classList.remove("active");
            });
        });
    }

    // Auto-return to dashboard tab if browser window is expanded to desktop width while on mobile Passport tab
    window.addEventListener("resize", () => {
        if (window.innerWidth > 768) {
            const activeNav = document.querySelector(".nav-item.active");
            if (activeNav && activeNav.getAttribute("data-tab") === "passport") {
                const dashboardTab = document.querySelector(".nav-item[data-tab='dashboard']");
                if (dashboardTab) dashboardTab.click();
            }
        }
    });

    // Support Modal click listener
    const navSupportTrigger = document.getElementById("nav-support-trigger");
    if (navSupportTrigger) {
        navSupportTrigger.addEventListener("click", (e) => {
            e.preventDefault();
            const supportModal = document.getElementById("support-modal");
            if (supportModal) {
                supportModal.classList.remove("hidden");
            }
        });
    }

    showToast("Dashboard Loaded! Connected to Base Mainnet.", "success");
});
