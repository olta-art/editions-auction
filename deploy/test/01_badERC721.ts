module.exports = async ({ getNamedAccounts, deployments}: any) => {
  const { deploy } = deployments
  const { deployer } = await getNamedAccounts()

  await deploy("BadERC721", {
    from: deployer,
    args: [],
    log: true,
  })
}

module.exports.tags = ["BadERC721"]

module.exports.skip = async ({network}: any ) => network.name != "hardhat"
