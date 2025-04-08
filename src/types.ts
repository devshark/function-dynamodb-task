export type TConfig = {
  DB_USERS_TABLE: string;
  DB_TRANSACTIONS_TABLE: string;
  DEFAULT_BALANCE: number;
  DEFAULT_CURRENCY: "USD";
  USER_SEED_SIZE: number;
};

// spec according to the doc
export type UserBalanceFunction = {
  (input: GetUserBalanceInput): Promise<string>;
};

// spec according to the doc
export type TransactionFunction = {
  (input: TransactionInput): Promise<void>;
};

export type Balance = {
  amount?: number;
  currency: string;
};

export type User = {
  userId: string;
  balance?: Balance;
};

export class InvalidUserIdError extends Error {
  constructor() {
    super("Missing required userId field");
    this.name = "InvalidUserIdError";
  }
}

export class UserNotFoundError extends Error {
  constructor(userId: string) {
    super(`User with ID ${userId} not found`);
    this.name = "UserNotFoundError";
  }
}

export type GetUserBalanceInput = {
  userId: string;
};

// can be an enum, but this is more portable
// export type TransactionType = "credit" | "debit";
export enum TransactionType {
  CREDIT = "credit",
  DEBIT = "debit",
}

/**
 * Transaction input parameters
 */
export interface TransactionInput {
  idempotentKey: string;
  userId: string;
  amount: string;
  type: TransactionType;
}

export class InvalidAmountError extends Error {
  constructor() {
    super("Invalid amount");
    this.name = "InvalidAmountError";
  }
}

export class InvalidIdempotencyKeyError extends Error {
  constructor() {
    super("Invalid idempotency key");
    this.name = "InvalidIdempotencyKeyError";
  }
}

export class InvalidTransactionTypeError extends Error {
  constructor() {
    super("Invalid transaction type");
    this.name = "InvalidTransactionTypeError";
  }
}

/**
 * Error thrown when a user attempts to debit more than their available balance
 */
export class InsufficientBalanceError extends Error {
  constructor() {
    super("Insufficient balance");
    this.name = "InsufficientBalanceError";
  }
}

/**
 * Error thrown when a transaction with the same idempotent key has already been processed
 */
export class DuplicateTransactionError extends Error {
  constructor(idempotentKey: string) {
    super(`Transaction ${idempotentKey} has already been processed`);
    this.name = "DuplicateTransactionError";
  }
}
