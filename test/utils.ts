import { network } from "hardhat";
import { BigNumber, ContractTransaction } from "ethers";
import { WETH } from "../typechain";
import { ethers } from "hardhat";

// Set a timestamp for the next block and mine it
export const mineToTimestamp = async (timestamp: BigNumber) => {
  await network.provider.send("evm_setNextBlockTimestamp", [timestamp.toNumber()])
  await network.provider.send("evm_mine")
}
export const setAutoMine = async (value: boolean) => await network.provider.send("evm_setAutomine", [value])
export const mine = async () =>  await network.provider.send("evm_mine")

// Hack to get event args
export const getEventArguments = async (tx: ContractTransaction, eventName: string) => {
  const receipt = await tx.wait()
  const event = receipt.events?.find(event => event.event === eventName)
  return event?.args!
}

export const deployWETH = async () => {
  const [deployer] = await ethers.getSigners();
  return (await (await ethers.getContractFactory("WETH")).deploy()) as WETH;
};