// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@artman325/releasemanager/contracts/CostManagerHelper.sol";
import "@artman325/community/contracts/interfaces/ICommunity.sol";
import "./interfaces/ISubscriptionsManagerUpgradeable.sol";
import "./interfaces/ISubscriptionsManagerFactory.sol";
import "./interfaces/ISubscriptionsHook.sol";
//import "hardhat/console.sol";
contract SubscriptionsManagerUpgradeable is OwnableUpgradeable, ISubscriptionsManagerUpgradeable, ReentrancyGuardUpgradeable, CostManagerHelper {
    uint32 public interval;
    uint16 public intervalsMax; // if 0, no max
    uint16 public intervalsMin;
    uint8 public retries;
    address public token; // the token to charge
    uint256 public price; // the price to charge

    address recipient;
    bool recipientImplementsHooks; // whether recipient is a contract that implements onTransfer, etc.

    mapping (address => Subscription) public subscriptions;
    mapping (address => bool) public callers;

    address public controller; // optional, smart contract that can start a subscription and pay first charge
    address public factory; // the factory
    //address owner; // owner can cancel subscriptions, add callers
    address community; // any CommunityContract
    uint8 roleId; // the role

    uint8 internal constant OPERATION_SHIFT_BITS = 240;  // 256 - 16
    // Constants representing operations
    uint8 internal constant OPERATION_INITIALIZE = 0x0;

    modifier onlyController() {
        
        if (controller == address(0)) {
            revert NotSupported();
        }

        if (controller != _msgSender()) {
            revert ControllerOnly(controller);
        }

        _;
    }

    
    modifier ownerOrCaller() {
        address ms = _msgSender();
        if (owner() != _msgSender() && callers[ms] != true) {
            revert OwnerOrCallerOnly();
        }
        _;
    }

    constructor() {
        _disableInitializers();
    }

    /**
    * @param interval_ period, day,week,month in seconds
    * @param intervalsMax_ max interval
    * @param intervalsMin_ min interval
    * @param retries_ amount of retries
    * @param token_ token address to charge
    * @param price_ price for subsription on single interval
    * @param controller_ [optional] controller address
    * @param recipient_ address which will obtain pay for subscription
    * @param recipientImplementsHooks_ if true then contract expected recipient as contract and will try to call ISubscriptionsHook(recipient).onCharge
    * @param costManager_ costManager address
    * @param producedBy_ producedBy address
    * @custom:calledby factory
    * @custom:shortd initialize while factory produce
    */
    function initialize(
        uint32 interval_,
        uint16 intervalsMax_,
        uint16 intervalsMin_,
        uint8 retries_,
        address token_,
        uint256 price_,
        address controller_,
        address recipient_,
        bool recipientImplementsHooks_,
        address costManager_,
        address producedBy_
    ) 
        external
        initializer  
        override
    {

        __CostManagerHelper_init(_msgSender());
        _setCostManager(costManager_);

        __Ownable_init();
        __ReentrancyGuard_init();
        
        factory = owner();

        interval = interval_;
        intervalsMax = intervalsMax_;
        intervalsMin = intervalsMin_;
        retries = retries_;
        token = token_;
        price = price_;
        controller = controller_;
        recipient = recipient_;
        recipientImplementsHooks = recipientImplementsHooks_;

        _accountForOperation(
            OPERATION_INITIALIZE << OPERATION_SHIFT_BITS,
            uint256(uint160(producedBy_)),
            0
        );
    }

    ///////////////////////////////////
    // external 
    ///////////////////////////////////
    function subscribeFromController(
        address subscriber, 
        uint256 customPrice, 
        uint16 desiredIntervals
    ) 
        external 
        override 
        onlyController
    {
        _subscribe(subscriber, customPrice, desiredIntervals);
    }
    function subscribe(
        uint16 desiredIntervals
    ) 
        external 
        override 
    {
        _subscribe(_msgSender(), price, desiredIntervals);
    }

    
    function cancel() external override {
        
        Subscription storage subscription = subscriptions[_msgSender()];
        if (subscription.state == SubscriptionState.ACTIVE) {
            _active(subscription, SubscriptionState.BROKEN);
            subscription.endTime = _currentBlockTimestamp();
            emit Canceled(subscription.subscriber, _currentBlockTimestamp());
        }
    }

    function cancel(address[] memory subscribers) external override onlyOwner {
        uint256 l = subscribers.length;
        for (uint256 i = 0; i < l; i++) {
            Subscription storage subscription = subscriptions[subscribers[i]];
            if (subscription.state == SubscriptionState.ACTIVE) {
                _active(subscription, SubscriptionState.BROKEN);
                subscription.endTime = _currentBlockTimestamp();
            }
            emit Canceled(subscription.subscriber, _currentBlockTimestamp());
        }
    
    }

    function charge(address[] memory subscribers) external override ownerOrCaller {
        // if all callers fail to do this within an interval
        // then restore() will have to be called before charge()
        _charge(subscribers, 1);
    }

    function restore() external override {
        address[] memory subscribers = new address[](1);
        subscribers[0] = _msgSender();
        _restore(subscribers, false);
    }
    function restore(address[] memory subscribers) external override ownerOrCaller{
        _restore(subscribers, true);
    }

    
    function addCaller(address caller) external override onlyOwner {
        callers[caller] = true;
    }
    function removeCaller(address caller) external override onlyOwner {
        //callers[caller] = false;
        delete callers[caller];
    }

    function isActive(address subscriber) external override view returns (bool, SubscriptionState) {
        Subscription storage subscription = subscriptions[subscriber];
        return (
            (
                subscription.state == SubscriptionState.ACTIVE || 
                subscription.state == SubscriptionState.EXPIRED 
                ? true 
                : false
            ),
            subscription.state
        );
    }
    function activeUntil(address subscriber) external override view returns (uint64) {
        Subscription storage subscription = subscriptions[subscriber];
        return subscription.endTime;
    }

    ///////////////////////////////////
    // public
    ///////////////////////////////////

    ///////////////////////////////////
    // internal
    ///////////////////////////////////
    /**
     * @notice helper function that returns the current block timestamp within the range of uint32, i.e. [0, 2**64 - 1]
     */
    function _currentBlockTimestamp() internal view returns (uint64) {
        return uint64(block.timestamp);
    }

    ///////////////////////////////////
    // private
    ///////////////////////////////////

    // must prepay intervalsMin intervals to start a subscription
    function _subscribe(
        address subscriber, 
        uint256 fee, 
        uint16 desiredIntervals
    ) 
        private 
    {
        
        if (intervalsMax > 0 && desiredIntervals > intervalsMax) {
            revert SubscriptionTooLong();
        }
        if (desiredIntervals == 0 && desiredIntervals < intervalsMin) {
            revert SubscriptionTooShort();
        }
        subscriptions[subscriber] = Subscription(
            fee,
            subscriber,
            _currentBlockTimestamp(),
            _currentBlockTimestamp(),
            desiredIntervals,
            SubscriptionState.EXPIRED
        );

        //---
        address[] memory subscribers = new address[](1);
        subscribers[0] = subscriber;
        //---
        uint16 count = _charge(subscribers, intervalsMin > 0 ? intervalsMin : 1); // charge the first intervalsMin intervals
        if (count > 0) {
            emit Subscribed(subscriber, _currentBlockTimestamp());
        }
    }

    // doesn't just charge but updates valid subscriptions
    // to be either extended or broken and set endTime
    // requiring them to be restored
    function _charge(
        address[] memory subscribers, 
        uint16 desiredIntervals
    ) 
        private 
        returns(uint16 count)
    {
        
        uint256 l = subscribers.length;
        
        for (uint256 i = 0; i < l; i++) {
            address subscriber = subscribers[i];
            Subscription storage subscription = subscriptions[subscriber];

            if (subscription.endTime > _currentBlockTimestamp()) {

                // subscription is still active, no need to charge
                continue;
            }

            if (subscription.endTime < _currentBlockTimestamp() - interval) {

                // subscription turn to BROKEN state
                _active(subscription, SubscriptionState.BROKEN);
                emit SubscriptionIsBroken(subscriber, _currentBlockTimestamp());
                continue;
            }
            if (_currentBlockTimestamp() - subscription.startTime > interval * subscription.intervals) {
                // turn into the broken state, which can not be restored
                _active(subscription, SubscriptionState.BROKEN);
                emit SubscriptionExpired(subscriber, _currentBlockTimestamp());
                continue;
            }
            
            bool result = ISubscriptionsManagerFactory(factory).doCharge(token, subscription.price * desiredIntervals, subscriber, recipient);

            if (result) {
                _active(subscription, SubscriptionState.ACTIVE);
                emit Charged(subscriber, subscription.price * desiredIntervals);
                subscription.endTime += interval * desiredIntervals;
                count++;
            } else {
                _active(subscription, SubscriptionState.EXPIRED);
                emit ChargeFailed(subscriber, subscription.price);
            }
            if (recipientImplementsHooks) {
                ISubscriptionsHook(recipient).onCharge(token, price);
            }
        }
        
        
    }

    function _active(Subscription storage subscription, SubscriptionState newState) private {
        if (subscription.state == newState) {
            return; // nothing to do
        }
        subscription.state = newState;
        emit StateChanged(subscription.subscriber, newState);
        
        if (community == address(0)) {
            return; // nothing to do
        }

        address[] memory _s = new address[](1);
        uint8[] memory _r = new uint8[](1);
        _s[0] = subscription.subscriber;
        _r[0] = roleId;
        if (newState == SubscriptionState.ACTIVE) {
            ICommunity(community).grantRoles(_s, _r);
        } else {
            ICommunity(community).revokeRoles(_s, _r);
        }
    }

    function _restore(
        address[] memory subscribers, 
        bool ownerOrCaller_
    ) 
        private 
    {
        uint256 l = subscribers.length;
        for (uint256 i = 0; i < l; i++) {
            address subscriber = subscribers[i];
            Subscription storage subscription = subscriptions[subscriber];
            if (subscription.state == SubscriptionState.ACTIVE) {
                continue; // already active
            }
            uint64 difference = uint64(_currentBlockTimestamp() - subscription.endTime);
            uint64 diffIntervals = difference / interval + 1; // rounds up to nearest integer
            if (!ownerOrCaller_ && diffIntervals > uint64(retries)) {
                emit RetriesExpired(subscriber, _currentBlockTimestamp(), diffIntervals);
                continue;
            }
            if (_currentBlockTimestamp() - subscription.startTime > interval * subscription.intervals) {
                emit SubscriptionExpired(subscriber, _currentBlockTimestamp());
                continue;
            }

            uint256 amount = subscription.price;
            if (amount == 0) {
                amount = price;
            }

            bool result = ISubscriptionsManagerFactory(factory).doCharge(token, subscription.price * diffIntervals, subscriber, recipient);

            if (result) {
                _active(subscription, SubscriptionState.ACTIVE);
                emit Restored(subscriber, _currentBlockTimestamp(), subscription.endTime);
                subscription.endTime += interval * diffIntervals;
            } else {
                emit ChargeFailed(subscriber, amount);
            }
        }
    }

}