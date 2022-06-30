// deploys GetInterfaceId helper contract
// and logs the interfaceId's to in the console
// run this script: yarn hardhat run scripts/helpers/getInterfaceId.ts

import { Helpers } from "../../typechain";
import { ethers } from "hardhat";

const getInterfaceIds = async () => {
  // deploy helpers
  const helpersFactory = await ethers.getContractFactory("Helpers")
  const helpers = await helpersFactory.deploy() as Helpers;

  // log the interface Id's
  await helpers.getStandardProjectInterfaceId()
  await helpers.getSeededProjectInterfaceId()
}

getInterfaceIds()