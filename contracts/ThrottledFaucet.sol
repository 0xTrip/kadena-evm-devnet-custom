// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

/**
 * @title ThrottledFaucet
 * @dev UUPS Upgradeable contract that manages the distribution of native and ERC20 tokens
 * with rate limiting (throttling) functionality.
 */
contract ThrottledFaucet is AccessControl, ReentrancyGuardTransient {
    // Role for setting configuring the faucet
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    // Role for dispensing and withdrawing tokens
    bytes32 public constant FAUCET_ROLE = keccak256("FAUCET_ROLE");

    // Mapping to track last claim time per address
    mapping(address => uint256) public lastClaimed;

    // Cooldown period in seconds
    uint256 public cooldownPeriod;

    // Amount to dispense for native token (in wei)
    uint256 public nativeTokenAmount;

    // Events
    event NativeTokenDispensed(
        address indexed executedBy,
        address indexed recipient,
        uint256 amount
    );
    event CooldownPeriodUpdated(
        address indexed executedBy,
        uint256 oldPeriod,
        uint256 newPeriod
    );
    event NativeTokenAmountUpdated(
        address indexed executedBy,
        uint256 oldAmount,
        uint256 newAmount
    );
    event NativeTokenReceived(address indexed sender, uint256 amount);
    event NativeTokenWithdrawn(address indexed executedBy, uint256 amount);

    // Errors
    error InvalidRecipient(address recipient);
    error ValueMustBeGreaterThanZero(uint256 value);
    error ValueMustBeDifferent(uint256 oldValue, uint256 newValue);
    error InsufficientNativeTokenBalance(
        uint256 balance,
        uint256 nativeTokenAmount
    );
    error TransferNativeTokenFailed(address recipient, uint256 amount);
    error CooldownPeriodNotElapsed(
        address recipient,
        uint256 lastClaimed,
        uint256 cooldownPeriod
    );
    error InsufficientWithdrawalBalance(
        uint256 balance,
        uint256 withdrawalAmount
    );
    error WithdrawalFailed(address recipient, uint256 amount);

    constructor(uint256 _cooldownPeriod, uint256 _nativeTokenAmount) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        cooldownPeriod = _cooldownPeriod;
        nativeTokenAmount = _nativeTokenAmount;
    }

    /**
     * @notice Dispenses native token to the specified recipient
     * @dev Uses onlyRole modifier to restrict access to the FAUCET_ROLE
     * @dev Uses nonReentrant modifier to prevent reentrancy attacks
     * @dev Is rate-limited to prevent abuse
     * @dev Checks if the cooldown period has elapsed since the last claim
     * @dev Transfers the specified amount of native tokens to the recipient
     * @dev Reverts if the recipient address is zero
     * @dev Reverts if the cooldown period has not elapsed or if the contract has insufficient funds
     * @dev Reverts if the transfer fails
     * @dev Emits a NativeTokenDispensed event upon successful transfer
     * @param recipient Address to receive the native tokens
     */
    function dispenseNativeToken(
        address recipient
    ) external onlyRole(FAUCET_ROLE) nonReentrant {
        require(recipient != address(0), InvalidRecipient(recipient));
        uint256 lastClaimedTime = lastClaimed[recipient];
        require(
            block.timestamp >= lastClaimedTime + cooldownPeriod,
            CooldownPeriodNotElapsed(recipient, lastClaimedTime, cooldownPeriod)
        );

        require(
            address(this).balance >= nativeTokenAmount,
            InsufficientNativeTokenBalance(
                address(this).balance,
                nativeTokenAmount
            )
        );

        lastClaimed[recipient] = block.timestamp;
        (bool success, ) = payable(recipient).call{value: nativeTokenAmount}(
            ""
        );
        require(
            success,
            TransferNativeTokenFailed(recipient, nativeTokenAmount)
        );

        emit NativeTokenDispensed(msg.sender, recipient, nativeTokenAmount);
    }

    /**
     * @notice Updates pdate the cooldown period
     * @dev Uses onlyRole modifier to restrict access to the ADMIN_ROLE
     * @dev Reverts if the new period is not greater than zero
     * @dev Reverts if the new period is the same as the old period
     * @dev Emits a CooldownPeriodUpdated event upon successful update
     * @param newPeriod New cooldown period in seconds
     */
    function setCooldownPeriod(
        uint256 newPeriod
    ) external onlyRole(ADMIN_ROLE) {
        require(newPeriod > 0, ValueMustBeGreaterThanZero(newPeriod));
        uint256 oldPeriod = cooldownPeriod;
        require(
            newPeriod != oldPeriod,
            ValueMustBeDifferent(oldPeriod, newPeriod)
        );

        cooldownPeriod = newPeriod;
        emit CooldownPeriodUpdated(msg.sender, oldPeriod, newPeriod);
    }

    /**
     * @notice Updates native token dispense amount
     * @dev Uses onlyRole modifier to restrict access to the ADMIN_ROLE
     * @dev Reverts if the new amount is not greater than zero
     * @dev Reverts if the new amount is the same as the old amount
     * @dev Emits a NativeTokenAmountUpdated event upon successful update
     * @param newAmount New native token amount to dispense (in wei)
     */
    function setNativeTokenAmount(
        uint256 newAmount
    ) external onlyRole(ADMIN_ROLE) {
        require(newAmount > 0, ValueMustBeGreaterThanZero(newAmount));
        uint256 oldAmount = nativeTokenAmount;
        require(
            newAmount != oldAmount,
            ValueMustBeDifferent(oldAmount, newAmount)
        );

        nativeTokenAmount = newAmount;
        emit NativeTokenAmountUpdated(msg.sender, oldAmount, newAmount);
    }

    /**
     * @notice Withdraws native tokens to caller address
     * @dev Uses onlyRole modifier to restrict access to the ADMIN_ROLE
     * @dev Reverts if the contract has insufficient balance
     * @dev Reverts if the transfer fails
     * @param amount Amount of native tokens to withdraw
     */
    function withdrawNativeToken(uint256 amount) external onlyRole(ADMIN_ROLE) {
        require(
            address(this).balance >= amount,
            InsufficientWithdrawalBalance(address(this).balance, amount)
        );
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, WithdrawalFailed(msg.sender, amount));
        emit NativeTokenWithdrawn(msg.sender, amount);
    }

    /**
     * @dev Function to receive ETH
     */
    receive() external payable {
        emit NativeTokenReceived(msg.sender, msg.value);
    }
}
