// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "../interfaces/ISubscriptionsHook.sol";

contract MockSubscriptionsHook is ISubscriptionsHook {
    bool public chargeCallbackTriggered = false;

    function onCharge(address token, uint256 amount) external {
        chargeCallbackTriggered = true;
    }
}
