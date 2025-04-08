import {
  DynamoDB,
  TransactWriteItemsCommand,
  TransactionCanceledException, GetItemCommand
} from "@aws-sdk/client-dynamodb";
import { Config } from "../config";
import {
  InsufficientBalanceError,
  InvalidAmountError,
  InvalidIdempotencyKeyError, InvalidTransactionTypeError,
  TConfig,
  TransactionFunction,
  TransactionInput,
  TransactionType,
  UserNotFoundError
} from "../types";
import { UserService } from "../user/user";

// Class to handle transactions. It does not concern about users' existence
// Unfortunately, we still need to access users tables here to validate balances.
// Note: For complete features including user existence, use the facade function createTransactFn
export class TransactService {
  private _client: DynamoDB;
  private _tableName: string;
  private _usersTableName: string;

  constructor(client: DynamoDB, config: TConfig) {
    this._client = client;
    this._tableName = config.DB_TRANSACTIONS_TABLE;
    this._usersTableName = config.DB_USERS_TABLE;
  }

  // Check if a transaction with the given idempotent key already exists
  async checkExistingTransaction(idempotencyKey: string) {
    const params = {
      TableName: this._tableName,
      Key: {
        idempotencyKey: { S: idempotencyKey },
      },
    };

    const response = await this._client.send(new GetItemCommand(params));

    return response.Item;
  }

  // input validation
  validate(input: TransactionInput): void {
    if (!input.userId) {
      throw new UserNotFoundError(input.userId);
    }

    if (!input.idempotentKey) {
      throw new InvalidIdempotencyKeyError();
    }

    if (
      !input.amount ||
      isNaN(Number(input.amount)) ||
      Number(input.amount) <= 0
    ) {
      throw new InvalidAmountError();
    }

    // if it's not empty, the type system would have already checked it
    if (!input.type) {
      throw new InvalidTransactionTypeError();
    }
  }

  // this method will not perform any validation
  async transact(input: TransactionInput): Promise<void> {
    const isCredit = input.type === TransactionType.CREDIT;

    // prepare credit user balance update
    const creditUserBalance = {
      Update: {
        TableName: this._usersTableName,
        Key: { userId: { S: input.userId } },
        UpdateExpression: "SET #balance = if_not_exists(#balance, :zero) + :amount",
        ExpressionAttributeValues: {
          ":amount": { N: input.amount },
          ":zero": { N: "0" },
        },
        ExpressionAttributeNames: {
          "#balance": "balance",
        }
      }
    }

    // prepare debit user balance update
    const debitUserBalance = {
      Update: {
        TableName: this._usersTableName,
        Key: { userId: { S: input.userId } },
        UpdateExpression: "SET #balance = #balance - :amount",
        ExpressionAttributeValues: {
          ":amount": { N: input.amount },
        },
        ExpressionAttributeNames: {
          "#balance": "balance",
        },
        ConditionExpression: "attribute_exists(#balance) AND #balance >= :amount",
      }
    }

    // prepare insert new transaction
    const insertNewTransaction = {
      Put: {
        TableName: this._tableName,
        Item: {
          idempotencyKey: { S: input.idempotentKey },
          userId: { S: input.userId },
          amount: { N: input.amount },
          type: { S: input.type },
          // resultingBalance: { S: resultingBalance },
          timestamp: { N: Date.now().toString() },
        },
        // This ensures we don't overwrite an existing transaction
        ConditionExpression: "attribute_not_exists(idempotencyKey)",
      },
    };

    try {
      // console.debug("Performing transaction", {
      //   updateUserBalance: JSON.stringify(isCredit ? creditUserBalance : debitUserBalance),
      //   insertNewTransaction: JSON.stringify(insertNewTransaction),
      // });

      // Perform the transaction as an atomic operation
      await this._client.send(
        new TransactWriteItemsCommand({
          TransactItems: [
            // First item: Update the user's balance to ensure it has enough balance if debiting
            isCredit ? creditUserBalance : debitUserBalance,
            // Second item: Record the transaction for idempotency
            insertNewTransaction,
          ],
        })
      );

      return;
    } catch (error) {
      console.error("Transaction failed", error instanceof TransactionCanceledException, error, );
      if (error instanceof TransactionCanceledException) {
        console.debug("Transaction canceled", error.CancellationReasons);
        // first statement failed due to condition check
        if (!isCredit && error.CancellationReasons?.[0]?.Code === "ConditionalCheckFailed") {
          // the user's balance was not sufficient for debiting
          throw new InsufficientBalanceError();
        }

        // Check if the transaction was cancelled due to the idempotency condition
        const idempotencyConflict = error.CancellationReasons?.some(
          (reason) =>
            reason.Code === "ConditionalCheckFailed" &&
            reason.Item?.idempotencyKey?.S === input.idempotentKey
        );

        if (idempotencyConflict) {
          // If there was a race condition where another process inserted the same
          // transaction between our initial check and the transaction write,
          // check if the transaction already exists then do nothing
          const existingTransaction = await this.checkExistingTransaction(input.idempotentKey);
          if (existingTransaction) {
            return;
          }
        }

        // If the transaction failed due to the user's balance changing (race condition)
        // we could retry the transaction, but for simplicity we'll throw an error
        throw new Error(`Transaction failed: ${error.message}`);
      }

      throw error;
    }
  }
}

// wrapper that creates a facade function that matches the type signature in the requirements
export function createTransactFn(client: DynamoDB): TransactionFunction {
  const userService = new UserService(client, Config);
  const transactService = new TransactService(client, Config);

  return async (input: TransactionInput) => {
    // input validation
    transactService.validate(input);

    // check if user exists
    const user = await userService.getUserItem(input.userId);
    if (!user) {
      throw new UserNotFoundError(input.userId);
    }

    // check if transaction already exists
    const existing = await transactService.checkExistingTransaction(
      input.idempotentKey
    );
    if (existing) {
      // do nothing
      return; 
    }

    // proceed with the transaction, failing if user doesn't have enough balance if debit
    await transactService.transact(input);
  };
}
