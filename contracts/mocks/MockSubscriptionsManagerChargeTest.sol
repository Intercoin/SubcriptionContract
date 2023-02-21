// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "../interfaces/ISubscriptionsManagerFactory.sol";

contract MockSubscriptionsManagerChargeTest {
    bool state;

    function chargeMock(
        address factoryAddress,
        address targetToken, 
        uint256 amount,
        address from,
        address to
    ) external {
        state = false;
        state = ISubscriptionsManagerFactory(factoryAddress).doCharge(targetToken, amount, from, to);
    }

    function viewState() public view returns(bool) {
        return state;
    }

}
