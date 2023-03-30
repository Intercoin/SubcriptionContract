// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "@artman325/releasemanager/contracts/CostManagerHelper.sol";
import "@artman325/community/contracts/interfaces/ICommunity.sol";
import "./interfaces/ISubscriptionsManagerUpgradeable.sol";
import "./interfaces/ISubscriptionsManagerFactory.sol";
import "./interfaces/ISubscriptionsHook.sol";

contract SubscriptionsManagerUpgradeable is OwnableUpgradeable, ISubscriptionsManagerUpgradeable, ReentrancyGuardUpgradeable, CostManagerHelper {
    uint32 public interval;
    uint16 public intervalsMax; // if 0, no max
    uint16 public intervalsMin;
    uint8 public retries;
    address public token; // the token to charge
    uint256 public price; // the price to charge

    address recipient;
    uint256 recipientTokenId;
    
    address hook;

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
    * @param recipient_ address which will receive the subscription payments
    * @param recipientTokenId_ if not 0, then recipient_ is interpreted as a NFT contract, while the token owner would be the actual recipient
    * @param hook_  if present then try to call hook.onCharge 
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
        uint256 recipientTokenId_,
        address hook_,
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
        recipientTokenId = recipientTokenId_;
        hook = hook_;

        _accountForOperation(
            OPERATION_INITIALIZE << OPERATION_SHIFT_BITS,
            uint256(uint160(producedBy_)),
            0
        );
    }

    ///////////////////////////////////
    // external 
    ///////////////////////////////////


   /**
    * @dev called by authorized controller contracts to start subscriptions with custom prices
    * @param subscriber the address that will be paying
    * @param customPrice custom price for this subscription
    * @param desiredIntervals the number of intervals (e.g. weeks) this subscription should last
    * @custom:calledby controller
    */
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

   /**
    * @dev starts a recurring subscription for msg.sender at the default price
    * @param desiredIntervals the number of intervals (e.g. weeks) this subscription should last
    */
    function subscribe(
        uint16 desiredIntervals
    ) 
        external 
        override 
    {
        _subscribe(_msgSender(), price, desiredIntervals);
    }

   /**
    * @dev cancels subscription that is currently active for the msg.sender
    */
    function cancel() external override {
        
        Subscription storage subscription = subscriptions[_msgSender()];
        if (subscription.state == SubscriptionState.ACTIVE) {
            _active(subscription, SubscriptionState.CANCELED);
            subscription.endTime = _currentBlockTimestamp();
            emit Canceled(subscription.subscriber, _currentBlockTimestamp());
        }
    }

   /**
    * @dev can be called by owner to unilateraly cancel multiple subscriptions
    * @param subscribers the addresses whose subscriptions to cancel
    * @custom:calledby owner
    */
    function cancel(address[] memory subscribers) external override onlyOwner {
        uint256 l = subscribers.length;
        for (uint256 i = 0; i < l; i++) {
            Subscription storage subscription = subscriptions[subscribers[i]];
            if (subscription.state == SubscriptionState.ACTIVE) {
                _active(subscription, SubscriptionState.CANCELED);
                subscription.endTime = _currentBlockTimestamp();
            }
            emit Canceled(subscription.subscriber, _currentBlockTimestamp());
        }
    
    }

   /**
    * @dev updates any CommunityContract in which roles will be granted and revoked
    * @param community_ the address of the community contract
    * @param roleId_ the role to grant/revoke, note that this SubscriptionContract should have a role that is able to grant/revoke roleId
    * @custom:calledby owner
    */
    function setCommunity(address community_, uint8 roleId_) external onlyOwner {
        if (roleId_ == 0 && community_ != address(0)) {
            revert invalidCommunitySettings();
        }
        //todo: also need to check "can this contract grant and revoke roleId"

        community = community_;
        roleId = roleId_;
    }

   /**
    * @dev called by authorized controller contracts to charge subscriptions
    * @param subscribers the addresses that will be paying
    * @custom:calledby owner or caller
    */
    function charge(address[] memory subscribers) external override ownerOrCaller {
        // if all callers fail to do this within an interval
        // then restore() will have to be called before charge()
        _charge(subscribers, 1, false);
    }

   /**
    * @dev attempt to charge and restore a lapsed subscription from msg.sender
    */
    function restore() external override {
        address[] memory subscribers = new address[](1);
        subscribers[0] = _msgSender();
        _restore(subscribers, false);
    }

   /**
    * @dev restore subscription
    * @param subscribers array of subscribers for whom to attempt to charge and restore a lapsed subscription
    * @custom:calledby owner or one of the added callers
    */
    function restore(address[] memory subscribers) external override ownerOrCaller{
        _restore(subscribers, true);
    }

   /**
    * @dev add an authorized caller who can call methods to charge subscribers or attempt to restore subscriptions
    * @param caller the address of the caller
    */
    function addCaller(address caller) external override onlyOwner {
        callers[caller] = true;
    }
    
   /**
    * @dev remove an authorized caller who can call methods to charge subscribers or attempt to restore subscriptions
    * @param caller the address of the caller
    */
    function removeCaller(address caller) external override onlyOwner {
        //callers[caller] = false;
        delete callers[caller];
    }

   /**
    * @dev find out the state of a subscriber
    * @param subscriber the address of the subscriber
    * @return active whether the subscription is still active
    * @return state the state of the subscription (NONE, ACTIVE, EXPRIED, CANCELED)
    */
    function isActive(address subscriber) external override view returns (bool, SubscriptionState) {
        Subscription storage subscription = subscriptions[subscriber];
        
        return (
            (
                subscription.state == SubscriptionState.ACTIVE ||
                subscription.state == SubscriptionState.LAPSED
            ),
            subscription.state
        );
    }

   /**
    * @dev find out the timestamp of when a subscription expires
    * @param subscriber the address of the subscriber
    * @return timestamp seconds since Unix epoch
    */
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
        if (desiredIntervals != 0 && desiredIntervals < intervalsMin) {
            revert SubscriptionTooShort();
        }
        subscriptions[subscriber] = Subscription(
            fee,
            subscriber,
            _currentBlockTimestamp(),
            _currentBlockTimestamp(),
            desiredIntervals,
            SubscriptionState.LAPSED
        );

        //---
        address[] memory subscribers = new address[](1);
        subscribers[0] = subscriber;
        //---
        uint16 count = _charge(subscribers, intervalsMin > 0 ? intervalsMin : 1, true); // charge the first intervalsMin intervals
        if (count > 0) {
            emit Subscribed(subscriber, _currentBlockTimestamp());
        }
    }

    // doesn't just charge but updates valid subscriptions
    // to be either extended or canceled and set endTime
    // requiring them to be restored
    function _charge(
        address[] memory subscribers, 
        uint16 desiredIntervals,
        bool firstTime
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
            // will turn into expired state after trying to charge
            // if (subscription.endTime > _currentBlockTimestamp() - interval*retries) {
            //     // subscription turn to EXPIRED state, need to charge or manually restore
            //     _active(subscription, SubscriptionState.EXPIRED);
            //     emit SubscriptionExpired(subscriber, _currentBlockTimestamp());
            //     continue;
            // }

            if (_subscriptionActualize(subscription)) {
                continue;
            }

            bool result = ISubscriptionsManagerFactory(factory).doCharge(
                token, getSubscriptionPrice(subscription) * desiredIntervals, subscriber,
                recipientTokenId != 0 ? IERC721Upgradeable(recipient).ownerOf(recipientTokenId) : recipient
            );

            if (result) {
                _active(subscription, SubscriptionState.ACTIVE);
                emit Charged(subscriber, getSubscriptionPrice(subscription) * desiredIntervals);
                subscription.endTime += interval * desiredIntervals;
                count++;

                if (hook != address(0)) {
                    ISubscriptionsHook(hook).onCharge(token, getSubscriptionPrice(subscription));
                }
            } else {
                if (firstTime) {
                    revert SubscriptionCantStart();
                } else {
                        
                    if (subscription.state != SubscriptionState.LAPSED) {
                        emit SubscriptionLapsed(subscriber, _currentBlockTimestamp());
                    }


                    _active(subscription, SubscriptionState.LAPSED);
                    emit ChargeFailed(subscriber, getSubscriptionPrice(subscription));
                
                }
            }
            
        }
        
        
    }

    function getSubscriptionPrice(Subscription storage subscription) private view returns(uint256) {
        return (subscription.price == 0) ? price : subscription.price;
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
    /**
    // try to check:
    // - is user interval expired?
    // - is subscription max interval expire?
    // - is exceed retries attempt?
    // - 
    */
    function _subscriptionActualize(Subscription storage subscription) private returns(bool skip){
        if (subscription.state == SubscriptionState.LAPSED) {
            if (
                // subscription turn to BROKEN state as reached maximum retries attempt
                (subscription.endTime < _currentBlockTimestamp() - interval*retries) || 
                // or exceed interval subscription
                (_currentBlockTimestamp() - subscription.startTime > interval * subscription.intervals)
            ) {
                // turn into the broken state, which can not be restored
                _active(subscription, SubscriptionState.BROKEN);
                emit SubscriptionIsCanceled(subscription.subscriber, _currentBlockTimestamp());
                //continue;
                skip = true;
            }
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

            if (subscription.state == SubscriptionState.LAPSED) {
            
               
                uint64 difference = uint64(_currentBlockTimestamp() - subscription.endTime);
                uint64 diffIntervals = difference / interval + 1; // rounds up to nearest integer
                if (!ownerOrCaller_ && diffIntervals > uint64(retries)) {
                    emit RetriesExpired(subscriber, _currentBlockTimestamp(), diffIntervals);
                    
                }

                if (_currentBlockTimestamp() - subscription.startTime > interval * subscription.intervals) {
                    emit SubscriptionExpired(subscriber, _currentBlockTimestamp());
                    _active(subscription, SubscriptionState.EXPIRED);
                    continue;
                }


                // and turn to broken if
                // - is user interval expired?
                // - is subscription max interval expire?
                // - is exceed retries attempt?
                // - 
                if (_subscriptionActualize(subscription)) {
                    continue;
                }

                

                uint256 amount = getSubscriptionPrice(subscription);
                
                bool result = ISubscriptionsManagerFactory(factory)
                .doCharge(
                    token, subscription.price * diffIntervals, subscriber,
                    recipientTokenId != 0 ? IERC721Upgradeable(recipient).ownerOf(recipientTokenId) : recipient
                );

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

}
