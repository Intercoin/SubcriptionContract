// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "../interfaces/ISubscriptionsManagerUpgradeable.sol";

contract MockController {
    function subscribeViaController(
        address subscriptionManager,
        address subscriber,
        uint256 customPrice,
        uint16 desiredIntervals
    ) external {
        ISubscriptionsManagerUpgradeable(subscriptionManager)
            .subscribeFromController(subscriber, customPrice, desiredIntervals);
    }
}
