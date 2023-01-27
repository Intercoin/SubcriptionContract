// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.7.0 <0.9.0;

interface SubscriptionsHooks
{
    function onCharge(token, amount);
}

contract SubscriptionsManagerFactory {
   
    // the usual:
    function produce();

    function produceDeterministic();

    mapping instances public;

    // make it do stuff on behalf of instances

    modifier onlyInstance () {
        require(instances[msg.caller], "ONLY_INSTANCE");
    };

    function doCharge(token, amount, from, to) onlyInstance public
    {
        IERC20(token).transferFrom(amount, from, to); // IERC20Upgradeable?
    }
}

contract SubscriptionsManager {

    constant uint32 DAY = 86400;
    constant uint32 WEEK = 604800;
    constant uint32 YEAR = 31536000;

    uint32 interval public;
    uint16 intervalsMax public; // if 0, no max
    uint16 intervalsMin public;
    uint8 retries public;
    address token public; // the token to charge
    uint256 price public; // the price to charge

    address recipient;
    bool recipientImplementsHooks = false; // whether recipient is a contract that implements onTransfer, etc.

    struct Subscription {
        uint256 price; // if not 0, it overrides the global price
        address subscriber;
        uint64 startTime;
        uint64 endTime; // because it was canceled or broken, otherwise it is when it expires
        uint16 intervals;
        bool active;
    };

    mapping (address => Subscription) subscriptions public;
    mapping (address => uint256) caller;

    address controller; // optional, smart contract that can start a subscription and pay first charge
    address factory; // the factory
    address owner; // owner can cancel subscriptions, add callers
    address community; // any CommunityContract
    uint8 roleId; // the role

    function initialize(
        uint32 interval_,
        uint16 intervalsMax_,
        uint16 intervalsMin_,
        uint8 retries,
        address token,
        uint256 price,
        address controller
    ) {
        factory = _msgCaller();
        // check controller contract was an instance of ANY factory from our ecosystem
        if (IFactory(factory).releaseManager.instances[controller] == 0) {
           throw new UnauthorizedContract(controller);
        } 
        [interval, intervalsMax, intervalsMin, retries, token, price] = [interval_, intervalsMax_, intervalsMin_, retries_, token_, price];
    };

    event Canceled(subscriber, cancelTime);
    event Subscribed(subscriber, startTime);
    event Restored(subscriber, restoreTime, startTime);
    event Charged(subscriber, amount);
    event ChargeFailed(subscriber, amount);
    event RetriesExpired(subscriber, tryTime, retries);
    event SubscriptionIsBroken(subscriber, chargeTime);
    event SubscriptionExpired(subscriber, chargeTime);
    event StateChanged(subscriber, newState);

    error SubscriptionTooLong();

    function subscribeFromController(address subscriber, uint256 customPrice, uint16 intervals) onlyController {
    {
        _subscribe(subscriber, _msgSender(), customPrice, intervals);
    }

    // called by the subscriber himself
    function subscribe(uint16 intervals) public // intervals is maximum times to renew
    {
        _subscribe(_msgSender(), address(0), 0, intervals);
    }
 
    // must prepay intervalsMin intervals to start a subscription
    function _subscribe(address subscriber, address controller, uint256 customPrice, uint16 intervals) private {
        uint256 amount = controller ? customPrice : price;
        if (intervalsMax > 0 && intervals > intervalsMax) {
            throw new SubscriptionTooLong();
        }
        if (intervals == 0 && intervals < intervalsMin) {
            throw new SubscriptionTooShort();
        }
        subscriptions[subscriber] = new Subscription(
            amount,
            subscriber,
            block.timestamp,
            block.timestamp,
            intervals
            false
        );
        uint16 count = _charge([subscriber], intervalsMin > 0 ? intervalsMin : 1); // charge the first intervalsMin intervals
        if (count > 0) {
            emit Subscribed(subscriber, block.time);
        }
    }

    // called by subscriber himself
    function cancel()
    {
        address subscriber = _msgCaller();
        Subscription subscription = subscriptions[subscriber];
        if (subscription.active) {
            _active(subscription, false);
            subscription.endTime = block.timestamp;
            emit Canceled(subscriber, block.timestamp);
        }
    }

    function cancel(address[] subscribers) onlyOwner
    {
        uint256 i, l=subscribers.length;
        for (i = 0; i<l; ++i) {
            address subscriber = subscribers[i];
            Subscription subscription = subscriptions[subscriber];
            if (subscription.active) {
                _active(subscription, false);
                subscription.endTime = block.timestamp;
            }
            emit Canceled(subscriber, block.timestamp);
        }
    }

    // called to charge some subscribers and extend their subscriptions
    function charge(address[] memory subscribers) public ownerOrCaller
    {
        // if all callers fail to do this within an interval
        // then restore() will have to be called before charge()
        _charge(subscribers, 1);
    }

    // doesn't just charge but updates valid subscriptions
    // to be either extended or broken and set endTime
    // requiring them to be restored
    function _charge(address[] memory subscribers, uint16 intervals) public returns(uint16 count) {
    {
        uint count = 0;
        uint256 i, l=subscribers.length;
        for (i = 0; i<l; ++i) {
            address subscriber = subscribers[i];
            Subscription subscription = subscriptions[subscriber];
            if (subscription.endTime > block.timestamp) {
                // subscription is still active, no need to charge
                continue;
            }
            if (subscription.endTime < block.timestamp - interval) {
                // subscription was broken, needs to be restored first
                _active(subscription, false);
                emit SubscriptionIsBroken(subscriber, amount);
                continue;
            }
            if (block.timestamp - subscription.startTime > interval * subscription.intervals) {
                _activate(false);
                emit SubscriptionExpired(subscriber, block.timestamp);
                continue;
            }
            uint256 amount = subscription.price;
            if (amount == 0) {
                amount = price;
            }
            (error, result) = SubscriptionsManagerFactory(factory)
                .doCharge(token, amount, subscriber, recipient);
            if (result) {
                emit Charged(subscriber, amount * intervals);
                subscription.endTime += interval * intervals;
                ++count;
            } else {
                emit Failed(subscriber, amount);
            }
            if (recipientImplementsHooks) {
                SubscriptionsHooks(recipient).onCharge(token, price);
            }
        }
        return count;
    }

    function restore(address[] subscribers) public ownerOrCaller
    {
       restore(subscribers, true);
    }

    function restore() public
    {
       restore([_msgCaller()], false);
    }

    function _restore(address[] subscribers, ownerOrCaller_) private
    {
        uint256 i, l=subscribers.length;
        for (i = 0; i<l; ++i) {
            address subscriber = subscribers[i];
            Subscription subscription = subscriptions[subscriber];
            if (subscription.active) {
                continue; // already active
            }
            uint64 difference = uint64(block.timestamp - subscription.endTime);
            uint16 intervals = difference / interval + 1; // rounds up to nearest integer
            if (!ownerOrCaller_ && intervals > retries) {
                emit RetriesExpired(subscriber, block.timestamp, intervals);
                continue;
            }
            if (block.timestamp - subscription.startTime > interval * subscription.intervals) {
                emit SubscriptionExpired(subscriber, block.timestamp);
                continue;
            }

            uint256 amount = subscription.price;
            if (amount == 0) {
                amount = price;
            }

            (error, result) = SubscriptionsManagerFactory(factory)
                    .doCharge(token, amount * intervals, subscriber, recipient);
            if (result) {
                _active(subscription, true);
                subscription.endTime += interval * intervals;
                emit Restored(subscriber, block.timestamp, subscription);
            } else {
                emit ChargeFailed(subscriber, amount);
            }
        }
    }

    function isActive(subscriber) view return (bool)
    {
        Subscription subscription = subscriptions[subscriber];
        return subscription.active;
    }

    function activeUntil(subscriber) view returns (uint64)
    {
        Subscription subscription = subscriptions[subscriber];
        return subscription.endTime;
    }

    function addCaller(address caller) onlyOwner {
        callers[caller] = 1;
    }

    function removeCaller(address caller) onlyOwner {
        callers[caller] = 0;
    }
    
    
    modifier ownerOrCaller() {

    }

    function _active(Subscription subscription, bool newState) private {
        if (subscription.active == newState) {
            return; // nothing to do
        }
        subscription.active = newState;
        emit StateChanged(subscriber, newState);
        address subscriber = subscription.subscriber;
        if (community == address(0)) {
            return; // nothing to do
        }
        if (newState) {
            CommunityContract(community).grantRole(subscriber, roleId);
        } else {
            CommunityContract(community).revokeRole(subscriber, roleId);
        }
    }

}