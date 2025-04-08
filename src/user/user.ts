import {
  Balance,
  GetUserBalanceInput,
  TConfig,
  InvalidUserIdError,
  UserNotFoundError,
  UserBalanceFunction,
} from "../types";
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";

// wrapper that creates a facade function that matches the type signature in the requirements
export function createUserBalanceFn(
  db: DynamoDBClient,
  config: TConfig
): UserBalanceFunction {
  const userService = new UserService(db, config);

  // IMO we can just bind the getUserBalance method, but this seems more readable and explicit
  // Alternative: return userService.getUserBalance.bind(userService);
  return function (input: GetUserBalanceInput) {
    return userService.getUserBalance(input);
  };
}

export class UserService {
  private _client: DynamoDBClient;
  private _defaultBalance: Balance;
  private _tableName: string;

  // it's a good practice to inject dependencies instead of using them directly
  // this allows for easier testing and better separation of concerns
  constructor(client: DynamoDBClient, config: TConfig) {
    this._client = client;
    this._tableName = config.DB_USERS_TABLE;
    this._defaultBalance = {
      amount: config.DEFAULT_BALANCE,
      currency: config.DEFAULT_CURRENCY,
    };
  }

  // Get the user item from DynamoDB
  async getUserItem(userId: string) {
    const response = await this._client.send(
      new GetItemCommand({
        TableName: this._tableName,
        Key: {
          userId: { S: userId },
        },
      })
    );

    return response.Item;
  }

  // make sure the method adhers to the interface
  getUserBalance: UserBalanceFunction = async (input: GetUserBalanceInput) => {
    // validation
    if (!input.userId) {
      throw new InvalidUserIdError();
    }

    // execute the command to dynamodb
    const item = await this.getUserItem(input.userId);

    // check the result
    if (item) {
      const { balance, currency } = item;

      // balance could be undefined
      if (!balance) {
        console.warn(`No balance for user ${input.userId}, returning default`);

        // NB: The requirement says that the function should return the default balance
        // nothing about backfilling the user balance with the default value
        // May need to change this in the future if the requirement changes
        // Creating/Updating the User balance here violates the Single Responsibility Principle

        return `${this._defaultBalance.amount} ${this._defaultBalance.currency}`;
      }

      // currency might be undefined, so we use the ?. notation to support optional chaining
      return `${balance.N} ${currency?.S || this._defaultBalance.currency}`;
    }

    throw new UserNotFoundError(input.userId);
  };
}
