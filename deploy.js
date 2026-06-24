// Deployment script for BasePassportNFT on Base
const hre = require("hardhat");

async function main() {
  // Replace this with YOUR own wallet address where you want to collect the mint fees
  const feeCollectionOwnerAddress = "0x1387856FfB7eDB08Aa5492Bce38e83B0c3a85684"; 

  console.log("Starting deployment of BasePassportNFT...");

  // Get the contract factory
  const BasePassportNFT = await hre.ethers.getContractFactory("BasePassportNFT");

  // Deploy the contract and set the initial owner (fee collection address)
  const passportNFT = await BasePassportNFT.deploy(feeCollectionOwnerAddress);

  await passportNFT.waitForDeployment();

  console.log("------------------------------------------------");
  console.log(`BasePassportNFT successfully deployed!`);
  console.log(`Contract Address: ${await passportNFT.getAddress()}`);
  console.log(`Fee Collection Owner Address: ${feeCollectionOwnerAddress}`);
  console.log("------------------------------------------------");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
