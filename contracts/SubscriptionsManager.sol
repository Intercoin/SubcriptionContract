// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.0 <0.9.0;
import "./interfaces/ISubscriptionsManager.sol";

contract SubscriptionsManager is ISubscriptionsManager {
    uint32 public interval;
    uint16 public intervalsMax; // if 0, no max
    uint16 public intervalsMin;
    uint8 public retries;
    address public token; // the token to charge
    uint256 public price; // the price to charge

    address recipient;
    bool recipientImplementsHooks = false; // whether recipient is a contract that implements onTransfer, etc.

    mapping (address => Subscription) public subscriptions;
    mapping (address => uint256) public caller;

    address controller; // optional, smart contract that can start a subscription and pay first charge
    address factory; // the factory
    address owner; // owner can cancel subscriptions, add callers
    address community; // any CommunityContract
    uint8 roleId; // the role

    function initialize(
        uint32 interval_,
        uint16 intervalsMax_,
        uint16 intervalsMin_,
        uint8 retries_,
        address token_,
        uint256 price_,
        address controller_
    ) 
        external 
        override
    {

        // check controller contract was an instance of ANY factory from our ecosystem
        // we put this checking into factory and avoid external calls (get releasemanager from factory, then check controller in releasemaanger)

        interval = interval_;
        intervalsMax = intervalsMax_;
        intervalsMin = intervalsMin_;
        retries = retries_;
        token = token_;
        price = price_;
        controller = controller_;
        
    }

    // -----------------------------
    // TBD methods
    // -----------------------------

    function subscribeFromController(
        address subscriber, 
        uint256 customPrice, 
        uint16 intervals
    ) external override {}
    
    // called by subscriber himself

    // intervals is maximum times to renew   
    function subscribe(uint16 intervals) external override {}
    function cancel() external override {}
    function restore() external override {}
    
    // called by owner
    function cancel(address[] memory subscribers) external override {}
    function addCaller(address caller) external override {}
    function removeCaller(address caller) external override {}
    
    // ownerOrCaller
    // called to charge some subscribers and extend their subscriptions
    function charge(address[] memory subscribers) external override {}// ownerOrCaller
    function restore(address[] memory subscribers) external override {} // ownerOrCaller
    
    function isActive(address subscriber) external override view returns (bool) {}
    function activeUntil(address subscriber) external override view returns (uint64) {}
}