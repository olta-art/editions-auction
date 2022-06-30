module.exports = async ({ getNamedAccounts, deployments }: any) => {
  const { deploy } = deployments
  const { deployer } = await getNamedAccounts()

  await deploy("WETH", {
    from: deployer,
    args: [],
    log: true,
  })
}

module.exports.tags = ["WETH"]

module.exports.skip = async ({network}: any ) => network.name != "hardhat"
