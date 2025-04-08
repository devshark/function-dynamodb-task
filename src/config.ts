import { TConfig } from "./types";

export const Config: TConfig = {
    DB_USERS_TABLE: 'Users',
    DB_TRANSACTIONS_TABLE: 'Transactions',
    DEFAULT_BALANCE: 100,
    DEFAULT_CURRENCY: "USD",
    USER_SEED_SIZE: 25, // max per batch in DynamoDB is 25
};