// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "../SubscriptionsManagerFactory.sol";

contract MockSubscriptionsManagerFactory is SubscriptionsManagerFactory {
    constructor(
        address _implementation,
        address _costManager,
        address _releaseManager
    ) 
        SubscriptionsManagerFactory(_implementation, _costManager, _releaseManager)
    {
    }
    
    function addIntoInstances(address addr) public {
        instances[addr] = true;
    }
}
