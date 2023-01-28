// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.0 <0.9.0;

interface ISubscriptionsManager {

    event Canceled(address subscriber, uint64 cancelTime);
    event Subscribed(address subscriber, uint64 startTime);
    event Restored(address subscriber, uint64 restoreTime, uint64 startTime);
    event Charged(address subscriber, uint256 amount);
    event ChargeFailed(address subscriber, uint256 amount);
    event RetriesExpired(address subscriber, uint64 tryTime, uint16 retries);
    event SubscriptionIsBroken(address subscriber, uint64 chargeTime);
    event SubscriptionExpired(address subscriber, uint64 chargeTime);
    event StateChanged(address subscriber, bool newState);

    error SubscriptionTooLong();
    error UnauthorizedContract(address controller);

    function initialize(
        uint32 interval_,
        uint16 intervalsMax_,
        uint16 intervalsMin_,
        uint8 retries,
        address token,
        uint256 price,
        address controller
    ) external;

    
    function subscribeFromController(
        address subscriber, 
        uint256 customPrice, 
        uint16 intervals
    ) external;
    
    // called by subscriber himself
    function subscribe(uint16 intervals) external; // intervals is maximum times to renew
    function cancel() external;
    function restore() external;
    
    // called by owner
    function cancel(address[] memory subscribers) external;
    function addCaller(address caller) external;
    function removeCaller(address caller) external;
    
    // ownerOrCaller
    // called to charge some subscribers and extend their subscriptions
    function charge(address[] memory subscribers) external;// ownerOrCaller
    function restore(address[] memory subscribers) external; // ownerOrCaller
    
    function isActive(address subscriber) external view returns (bool);
    function activeUntil(address subscriber) external view returns (uint64);
        
}