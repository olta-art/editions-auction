module.exports = async ({ getNamedAccounts, deployments }: any) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("EditionsAuction", {
    from: deployer,
    args: [deployer, 1000],
    log: true,
  });
};
module.exports.tags = ["EditionsAuction"];
