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

export const getRandomInt = (min: number, max: number) => {
  min = Math.ceil(min)
  max = Math.floor(max)
  return Math.floor(Math.random() * (max - min) + min)
}

export const getPreviousBlockTimestamp = async () => {
    const blockNumBefore = await ethers.provider.getBlockNumber();
    const blockBefore = await ethers.provider.getBlock(blockNumBefore);
    return blockBefore.timestamp;
}

// Helper function to compare two bignumbers within a margin of error
// returns true if difference is less than or equal to errorMargin
export const equalWithin = (bn1: BigNumber, bn2: BigNumber, errorMargin: BigNumber) => {
  const difference = bn1.sub(bn2)
  return difference.abs().lte(errorMargin)
}