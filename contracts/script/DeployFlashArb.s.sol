// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/FlashArb.sol";

contract DeployFlashArb is Script {
    // Aave V3 PoolAddressesProvider on Avalanche C-Chain
    address constant AAVE_PROVIDER = 0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console.log("Deployer:", deployer);
        console.log("Aave Provider:", AAVE_PROVIDER);
        console.log("Chain ID:", block.chainid);

        vm.startBroadcast(deployerKey);

        FlashArb arb = new FlashArb(AAVE_PROVIDER);

        vm.stopBroadcast();

        console.log("FlashArb deployed at:", address(arb));
        console.log("");
        console.log("Next steps:");
        console.log("  1. Set FLASH_ARB_ADDRESS=%s in .env.prod", vm.toString(address(arb)));
        console.log("  2. Fund the contract with token approvals if needed");
        console.log("  3. Rebuild worker container to pick up the new address");
    }
}
