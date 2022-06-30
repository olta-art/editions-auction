module.exports = async ({ getNamedAccounts, deployments }: any) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("DutchAuctionDrop", {
    from: deployer,
    args: [],
    log: true,
  });
};
module.exports.tags = ["DutchAuctionDrop"];
