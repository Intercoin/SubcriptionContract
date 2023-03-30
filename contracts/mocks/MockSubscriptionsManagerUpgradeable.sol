// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "../SubscriptionsManagerUpgradeable.sol";

contract MockSubscriptionsManagerUpgradeable is
    SubscriptionsManagerUpgradeable
{
    function setHook(address hook_) public {
        hook = hook_;
    }

    function setRecipient(address addr) public {
        recipient = addr;
    }

    function currentBlockTimestamp() public view returns (uint64) {
        return _currentBlockTimestamp();
    }
}
