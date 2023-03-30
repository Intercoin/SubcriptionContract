// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.0 <0.9.0;

interface ISubscriptionsManagerUpgradeable {
    enum SubscriptionState {
        NONE, // Subscription notfound. its like default value for subscription state
        LAPSED, // (when active in grace period)
        ACTIVE, //
        BROKEN, // (when user didnt pay after retries attempt exceeded)
        EXPIRED, // (when max intervals exceeded)
        CANCELED // (when user canceled)
    }
    struct Subscription {
        uint256 price; // if not 0, it overrides the global price
        address subscriber;
        uint64 startTime;
        uint64 endTime; // because it was canceled, otherwise it is when it expires
        uint16 intervals;
        SubscriptionState state;
    }

    event Canceled(address subscriber, uint64 cancelTime);
    event Subscribed(address subscriber, uint64 startTime);
    event Restored(address subscriber, uint64 restoreTime, uint64 startTime);
    event Charged(address subscriber, uint256 amount);
    event ChargeFailed(address subscriber, uint256 amount);
    event RetriesExpired(address subscriber, uint64 tryTime, uint64 retries);
    event SubscriptionIsCanceled(address subscriber, uint64 chargeTime);
    event SubscriptionExpired(address subscriber, uint64 chargeTime);
    event SubscriptionLapsed(address subscriber, uint64 chargeTime);
    event StateChanged(address subscriber, SubscriptionState newState);

    error SubscriptionTooLong();
    error SubscriptionTooShort();
    error ControllerOnly(address controller);
    error OwnerOrCallerOnly();
    error NotSupported();
    error invalidCommunitySettings();
    error SubscriptionCantStart();

    function initialize(
        uint32 interval,
        uint16 intervalsMax,
        uint16 intervalsMin,
        uint8 retries,
        address token,
        uint256 price,
        address controller,
        address recipient,
        uint256 recipientTokenId,
        address hook,
        address costManager,
        address producedBy
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
    function charge(address[] memory subscribers) external; // ownerOrCaller

    function restore(address[] memory subscribers) external; // ownerOrCaller

    function isActive(
        address subscriber
    ) external view returns (bool, SubscriptionState);

    function activeUntil(address subscriber) external view returns (uint64);
}
