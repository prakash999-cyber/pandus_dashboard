// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title BaseTransactionManager
 * @dev Comprehensive Web3 Smart Contract for handling Base Passport minting, Daily Check-Ins, 
 * Daily Games, and Badges/XP claims fee routing.
 */
contract BaseTransactionManager is ERC721URIStorage, Ownable, ReentrancyGuard {
    uint256 private _nextTokenId;
    
    // Configurable fees in ETH (enforced with strict exact-matching to prevent overpayments)
    uint256 public passportMintFee = 0.000003 ether;   // ~$0.01
    uint256 public checkInFee = 0.000001 ether;        // ~$0.003
    uint256 public gameRollFee = 0.000002 ether;       // ~$0.006
    uint256 public verificationFee = 0.000001 ether;   // ~$0.003 (Badges, OG status, Twitter Verify)

    // Security & Audit Events
    event PassportMinted(address indexed user, uint256 indexed tokenId, string tokenURI);
    event CheckInPaid(address indexed user, uint256 amount);
    event GameRollPaid(address indexed user, string gameName, uint256 amount);
    event VerificationPaid(address indexed user, string serviceName, uint256 amount);
    event FeesWithdrawn(address indexed owner, uint256 amount);

    constructor(address initialOwner) 
        ERC721("Base Onchain Passport", "BOP") 
        Ownable(initialOwner) 
    {}

    /**
     * @notice Mints a passport NFT to the sender.
     * @param tokenURI The metadata link containing the user's score, name, and passport image.
     */
    function mintPassport(string memory tokenURI) external payable nonReentrant returns (uint256) {
        require(msg.value == passportMintFee, "Incorrect ETH: Must send exact passport mint fee");

        uint256 tokenId = _nextTokenId++;
        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, tokenURI);

        emit PassportMinted(msg.sender, tokenId, tokenURI);
        return tokenId;
    }

    /**
     * @notice Process payment for Daily Check-In.
     */
    function payCheckIn() external payable nonReentrant {
        require(msg.value == checkInFee, "Incorrect ETH: Must send exact check-in fee");
        emit CheckInPaid(msg.sender, msg.value);
    }

    /**
     * @notice Process payment for Daily Games (Dice Roll, Mystery Box).
     * @param gameName The identifier of the game (e.g. "dice", "mystery").
     */
    function payGameRoll(string memory gameName) external payable nonReentrant {
        require(msg.value == gameRollFee, "Incorrect ETH: Must send exact game roll fee");
        emit GameRollPaid(msg.sender, gameName, msg.value);
    }

    /**
     * @notice Process payment for Verifications and claims (Twitter scan, Badges, OG Status).
     * @param serviceName The name of the claim or verification service.
     */
    function payVerification(string memory serviceName) external payable nonReentrant {
        require(msg.value == verificationFee, "Incorrect ETH: Must send exact verification fee");
        emit VerificationPaid(msg.sender, serviceName, msg.value);
    }

    /**
     * @notice Allows the owner to adjust fees.
     */
    function setFees(
        uint256 _mintFee, 
        uint256 _checkInFee, 
        uint256 _gameFee, 
        uint256 _verifyFee
    ) external onlyOwner {
        passportMintFee = _mintFee;
        checkInFee = _checkInFee;
        gameRollFee = _gameFee;
        verificationFee = _verifyFee;
    }

    /**
     * @notice Safely withdraws all collected fees from the contract to the owner's wallet address.
     */
    function withdrawFees() external onlyOwner nonReentrant {
        uint256 balance = address(this).balance;
        require(balance > 0, "No fees available for withdrawal");
        
        (bool success, ) = payable(owner()).call{value: balance}("");
        require(success, "Withdrawal transfer failed");

        emit FeesWithdrawn(owner(), balance);
    }
}
