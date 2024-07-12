// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;
import "@intercoin/community/contracts/interfaces/ICommunity.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

contract MockCommunity is ICommunity {
    using EnumerableSet for EnumerableSet.UintSet;
    //mapping(address => uint8[]) roles;
    mapping(address => EnumerableSet.UintSet) roles;

    uint256 count = 5;

    function initialize(
        address hook,
        address invitedHook,
        address costManager,
        address authorizedInviteManager,
        string memory name,
        string memory symbol,
        string memory contractUri
    ) external {}

    function addressesCount(
        uint8 /* roleIndex*/
    ) public view override returns (uint256) {
        return count;
    }

    function setMemberCount(uint256 _count) public {
        count = _count;
    }

    function setRoles(address member, uint8[] memory _roles) public {
        for (uint256 i = 0; i < _roles.length; i++) {
            roles[member].add(uint8(_roles[i]));
        }
    }

    function getRoles(
        address[] calldata members
    ) public view override returns (uint8[][] memory list) {
        // string[] memory list = new string[](5);
        // list[0] = 'owners';
        // list[1] = 'admins';
        // list[2] = 'members';
        // list[3] = 'sub-admins';
        // list[4] = 'unkwnowns';

        list = new uint8[][](members.length);

        for (uint256 i = 0; i < members.length; i++) {
            list[i] = new uint8[](roles[members[i]].length());
            for (uint256 j = 0; j < roles[members[i]].length(); j++) {
                list[i][j] = uint8(roles[members[i]].at(j));
            }
        }

        return list;
    }

    function getAddresses(
        uint8[] calldata /* rolesIndex*/
    ) public pure override returns (address[][] memory) {
        address[][] memory list = new address[][](0);
        return list;
    }
    function getRolesWhichAccountCanGrant(
        address accountWhichWillGrant,
        string[] memory roleNames
    ) external view returns (uint8[] memory) {}

    function hasRole(
        address account,
        uint8 roleIndex
    ) external view returns (bool) {
        return roles[account].contains(roleIndex);
        // for(uint256 i = 0; i < roles[account].length; i++) {
        //     if (roles[account][i] == roleIndex) {
        //         return true;
        //     }

        // }
        // return false;
    }

    function grantRoles(
        address[] memory accounts,
        uint8[] memory roleIndexes
    ) public {
        for (uint256 i = 0; i < roleIndexes.length; i++) {
            roles[accounts[i]].add(roleIndexes[i]);
        }
    }

    function revokeRoles(
        address[] memory accounts,
        uint8[] memory roleIndexes
    ) public {
        for (uint256 i = 0; i < roleIndexes.length; i++) {
            roles[accounts[i]].remove(roleIndexes[i]);
        }
    }
}
