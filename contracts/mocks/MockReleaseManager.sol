// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "@artman325/releasemanager/contracts/ReleaseManager.sol";

contract MockReleaseManager is ReleaseManager {
    function customRegisterInstance(address instanceAddress) external {
        instances[instanceAddress] = InstanceInfo(_msgSender());
    }
}
