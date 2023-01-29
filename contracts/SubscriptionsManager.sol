// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@Artman325/community/contracts/interfaces/ICommunity.sol";
import "./interfaces/ISubscriptionsManager.sol";
import "./interfaces/ISubscriptionsManagerFactory.sol";
import "./interfaces/ISubscriptionsHook.sol";

contract SubscriptionsManager is OwnableUpgradeable, ISubscriptionsManager {
    uint32 public interval;
    uint16 public intervalsMax; // if 0, no max
    uint16 public intervalsMin;
    uint8 public retries;
    address public token; // the token to charge
    uint256 public price; // the price to charge

    address recipient;
    bool recipientImplementsHooks; // whether recipient is a contract that implements onTransfer, etc.

    mapping (address => Subscription) public subscriptions;
    mapping (address => uint256) public callers;

    address public controller; // optional, smart contract that can start a subscription and pay first charge
    address public factory; // the factory
    //address owner; // owner can cancel subscriptions, add callers
    address community; // any CommunityContract
    uint8 roleId; // the role

    modifier onlyController() {
        
        if (controller == address(0)) {
            revert NotSupported();
        }

        if (controller != _msgSender()) {
            revert ControllerOnly(controller);
        }

        _;
    }

    function initialize(
        uint32 interval_,
        uint16 intervalsMax_,
        uint16 intervalsMin_,
        uint8 retries_,
        address token_,
        uint256 price_,
        address controller_,
        address recipient_,
        bool recipientImplementsHooks_
    ) 
        external 
        override
    {

        // check controller contract was an instance of ANY factory from our ecosystem
        // we put this checking into factory and avoid external calls (get releasemanager from factory, then check controller in releasemanager)

        __Ownable_init();
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
        if (subscription.active) {
            _active(subscription, false);
            subscription.endTime = _currentBlockTimestamp();
            emit Canceled(subscription.subscriber, _currentBlockTimestamp());
        }
    }

    function cancel(address[] memory subscribers) external override onlyOwner {
        uint256 l = subscribers.length;
        for (uint256 i = 0; i < l; i++) {
            Subscription storage subscription = subscriptions[subscribers[i]];
            if (subscription.active) {
                _active(subscription, false);
                subscription.endTime = _currentBlockTimestamp();
            }
            emit Canceled(subscription.subscriber, _currentBlockTimestamp());
        }
    
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
            false
        );

        //-
        address[] memory subscribers = new address[](1);
        subscribers[0] = subscriber;
        //-
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
            if (subscription.endTime > block.timestamp) {
                // subscription is still active, no need to charge
                continue;
            }
            if (subscription.endTime < block.timestamp - interval) {
                // subscription was broken, needs to be restored first
                _active(subscription, false);
                emit SubscriptionIsBroken(subscriber, _currentBlockTimestamp());
                continue;
            }
            if (block.timestamp - subscription.startTime > interval * subscription.intervals) {
                _active(subscription, false);
                emit SubscriptionExpired(subscriber, _currentBlockTimestamp());
                continue;
            }
            
            bool result = ISubscriptionsManagerFactory(factory).doCharge(token, subscription.price, subscriber, recipient);
            if (result) {
                emit Charged(subscriber, subscription.price * desiredIntervals);
                subscription.endTime += interval * desiredIntervals;
                count++;
            } else {
                emit ChargeFailed(subscriber, subscription.price);
            }
            if (recipientImplementsHooks) {
                ISubscriptionsHook(recipient).onCharge(token, price);
            }
        }
        
        
    }

    function _active(Subscription storage subscription, bool newState) private {
        if (subscription.active == newState) {
            return; // nothing to do
        }
        subscription.active = newState;
        emit StateChanged(subscription.subscriber, newState);
        
        if (community == address(0)) {
            return; // nothing to do
        }

        address[] memory _s = new address[](1);
        uint8[] memory _r = new uint8[](1);
        _s[0] = subscription.subscriber;
        _r[0] = roleId;
        if (newState) {
            ICommunity(community).grantRoles(_s, _r);
        } else {
            ICommunity(community).revokeRoles(_s, _r);
        }
    }



    // -----------------------------
    // TBD methods
    // -----------------------------

    
    
    // called by subscriber himself

    // intervals is maximum times to renew   
    
    function restore() external override {}
    
    // called by owner
    
    function addCaller(address caller) external override {}
    function removeCaller(address caller) external override {}
    
    // ownerOrCaller
    // called to charge some subscribers and extend their subscriptions
    function charge(address[] memory subscribers) external override {}// ownerOrCaller
    function restore(address[] memory subscribers) external override {} // ownerOrCaller
    
    function isActive(address subscriber) external override view returns (bool) {}
    function activeUntil(address subscriber) external override view returns (uint64) {}
}