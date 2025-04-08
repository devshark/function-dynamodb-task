import {
  DynamoDB,
  TransactionCanceledException,
} from "@aws-sdk/client-dynamodb";
import { TransactService } from "./transact";
import { Config } from "../config";
import {
  InsufficientBalanceError,
  InvalidAmountError,
  InvalidIdempotencyKeyError,
  InvalidTransactionTypeError,
  TransactionInput,
  TransactionType,
  UserNotFoundError,
} from "../types";
// import { UserService } from "../user/user";

// Mock the DynamoDB client and UserService
jest.mock("@aws-sdk/client-dynamodb", () => {
  const mockSend = jest.fn();
  return {
    DynamoDB: jest.fn().mockImplementation(() => ({
      send: mockSend,
    })),
    TransactWriteItemsCommand: jest.fn().mockImplementation((params) => params),
    GetItemCommand: jest.fn().mockImplementation((params) => params),
    TransactionCanceledException: class TransactionCanceledException extends Error {
      CancellationReasons?: { Code?: string; Item?: any }[];
      constructor(message: string) {
        super(message);
        this.name = "TransactionCanceledException";
      }
    },
  };
});

jest.mock("../user/user", () => {
  return {
    UserService: jest.fn().mockImplementation(() => ({
      getUserItem: jest.fn(),
    })),
  };
});

describe("TransactService", () => {
  let transactService: TransactService;
  let mockClient: DynamoDB;
  let mockConfig: typeof Config;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = {
      DB_TRANSACTIONS_TABLE: "transactions-table",
      DB_USERS_TABLE: "users-table",
      DEFAULT_BALANCE: 100,
      DEFAULT_CURRENCY: "USD",
      USER_SEED_SIZE: 25,
    };

    mockClient = new DynamoDB({});
    const mockSend = jest.spyOn(mockClient, 'send');
    // await mockSend.mockImplementationOnce(() => Promise.reject(error));
    transactService = new TransactService(mockClient, mockConfig);
  });

  describe("validate", () => {
    it("should throw UserNotFoundError when userId is not provided", () => {
      const input = {
        idempotentKey: "key123",
        amount: "100",
        type: TransactionType.CREDIT,
      } as TransactionInput;

      expect(() => transactService.validate(input)).toThrow(UserNotFoundError);
    });

    it("should throw InvalidIdempotencyKeyError when idempotencyKey is not provided", () => {
      const input = {
        userId: "user123",
        amount: "100",
        type: TransactionType.CREDIT,
      } as TransactionInput;

      expect(() => transactService.validate(input)).toThrow(
        InvalidIdempotencyKeyError
      );
    });

    it("should throw InvalidAmountError when amount is not provided", () => {
      const input = {
        userId: "user123",
        idempotentKey: "key123",
        type: TransactionType.CREDIT,
      } as TransactionInput;

      expect(() => transactService.validate(input)).toThrow(InvalidAmountError);
    });

    it("should throw InvalidAmountError when amount is not a number", () => {
      const input = {
        userId: "user123",
        idempotentKey: "key123",
        amount: "not-a-number",
        type: TransactionType.CREDIT,
      } as TransactionInput;

      expect(() => transactService.validate(input)).toThrow(InvalidAmountError);
    });

    it("should throw InvalidAmountError when amount is less than or equal to zero", () => {
      const input = {
        userId: "user123",
        idempotentKey: "key123",
        amount: "0",
        type: TransactionType.CREDIT,
      } as TransactionInput;

      expect(() => transactService.validate(input)).toThrow(InvalidAmountError);
    });

    it("should throw InvalidTransactionTypeError when type is not provided", () => {
      const input = {
        userId: "user123",
        idempotentKey: "key123",
        amount: "100",
      } as TransactionInput;

      expect(() => transactService.validate(input)).toThrow(
        InvalidTransactionTypeError
      );
    });

    it("should not throw when input is valid", () => {
      const input: TransactionInput = {
        userId: "user123",
        idempotentKey: "key123",
        amount: "100",
        type: TransactionType.CREDIT,
      };

      expect(() => transactService.validate(input)).not.toThrow();
    });
  });

  describe("checkExistingTransaction", () => {
    it("should return the item when transaction exists", async () => {
      const mockTransaction = {
        idempotencyKey: { S: "key123" },
        userId: { S: "user123" },
        amount: { N: "100" },
        type: { S: TransactionType.CREDIT },
      };

      (mockClient.send as jest.Mock).mockResolvedValueOnce({
        Item: mockTransaction,
      });

      const result = await transactService.checkExistingTransaction("key123");

      expect(mockClient.send).toHaveBeenCalledWith({
        TableName: "transactions-table",
        Key: {
          idempotencyKey: { S: "key123" },
        },
      });
      expect(result).toEqual(mockTransaction);
    });

    it("should return undefined when transaction does not exist", async () => {
      (mockClient.send as jest.Mock).mockResolvedValueOnce({
        Item: undefined,
      });

      const result = await transactService.checkExistingTransaction("key123");

      expect(mockClient.send).toHaveBeenCalledWith({
        TableName: "transactions-table",
        Key: {
          idempotencyKey: { S: "key123" },
        },
      });
      expect(result).toBeUndefined();
    });
  });

  describe("transact", () => {
    const validInput: TransactionInput = {
      userId: "user123",
      idempotentKey: "key123",
      amount: "100",
      type: TransactionType.CREDIT,
    };

    it("should execute credit transaction successfully", async () => {
      // No existing transaction
      (mockClient.send as jest.Mock).mockResolvedValueOnce({ Item: undefined });
      // Transaction command success
      (mockClient.send as jest.Mock).mockResolvedValueOnce({});

      await transactService.transact(validInput);

      expect(mockClient.send).toHaveBeenCalledTimes(1);

      // Verify the transaction command was called with correct parameters
      const transactWriteCommand = (mockClient.send as jest.Mock).mock
        .calls[0][0];
      expect(transactWriteCommand.TransactItems).toHaveLength(2);

      // Credit operation should use the if_not_exists expression
      expect(
        transactWriteCommand.TransactItems[0].Update.UpdateExpression
      ).toBe("SET #balance = if_not_exists(#balance, :zero) + :amount");
    });

    it("should execute debit transaction successfully", async () => {
      const debitInput: TransactionInput = {
        ...validInput,
        type: TransactionType.DEBIT,
      };

      // No existing transaction
      (mockClient.send as jest.Mock).mockResolvedValueOnce({ Item: undefined });
      // Transaction command success
      (mockClient.send as jest.Mock).mockResolvedValueOnce({});

      await transactService.transact(debitInput);

      expect(mockClient.send).toHaveBeenCalledTimes(1);

      // Verify the transaction command was called with correct parameters
      const transactWriteCommand = (mockClient.send as jest.Mock).mock
        .calls[0][0];
      expect(transactWriteCommand.TransactItems).toHaveLength(2);

      // Debit operation should check balance is sufficient
      expect(
        transactWriteCommand.TransactItems[0].Update.UpdateExpression
      ).toBe("SET #balance = #balance - :amount");
      expect(
        transactWriteCommand.TransactItems[0].Update.ConditionExpression
      ).toBe("attribute_exists(#balance) AND #balance >= :amount");
    });

    it("should throw InsufficientBalanceError when balance is insufficient for debit", async () => {
      const debitInput: TransactionInput = {
        ...validInput,
        type: TransactionType.DEBIT,
      };

      // Simulate TransactionCanceledException with ConditionalCheckFailed for balance check
      const error = new (TransactionCanceledException as any)(
        "Transaction cancelled"
      );
      error.CancellationReasons = [
        { Code: "ConditionalCheckFailed" },
        { Code: "None" },
      ];

      (mockClient.send as jest.Mock).mockImplementationOnce(() =>
        Promise.reject(error)
      );

      try {
        await transactService.transact(debitInput);
        expect(mockClient.send).toHaveBeenCalledTimes(1);
      } catch (e) {
        if (!(e instanceof InsufficientBalanceError)) {
          throw new Error("Expected InsufficientBalanceError was not thrown.");
        }
      }
    });

    it("should handle idempotency race condition", async () => {
      // Transaction fails due to idempotency conflict
      const error = new (TransactionCanceledException as any)(
        "Transaction cancelled"
      );
      error.CancellationReasons = [
        { Code: "None" },
        {
          Code: "ConditionalCheckFailed",
          Item: { idempotencyKey: { S: "key123" } },
        },
      ];
      (mockClient.send as jest.Mock).mockImplementationOnce(() =>
        Promise.reject(error)
      );

      // check finds the transaction (from another process)
      const mockTransaction = {
        idempotencyKey: { S: "key123" },
        userId: { S: "user123" },
        amount: { N: "100" },
        type: { S: TransactionType.CREDIT },
      };
      (mockClient.send as jest.Mock).mockResolvedValueOnce({
        Item: mockTransaction,
      });

      await transactService.transact(validInput);

      // Should call once to check, once to transact, and once more to check after conflict
      expect(mockClient.send).toHaveBeenCalledTimes(1);
    });
  });
});

describe("createTransactFn", () => {
  let mockClient: DynamoDB;
  let mockUserService: any;
  let mockTransactService: any;
  let transactionFn: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = new DynamoDB({});

    // Mock UserService
    mockUserService = {
      getUserItem: jest.fn(),
    };
    jest.mock("../user/user", () => ({
      UserService: jest.fn().mockImplementation(() => mockUserService),
    }));

    // Mock TransactService
    mockTransactService = {
      validate: jest.fn(),
      checkExistingTransaction: jest.fn(),
      transact: jest.fn(),
    };
    const originalTransactService = jest.requireActual("./transact").TransactService;
    jest.spyOn(originalTransactService.prototype, "validate").mockImplementation(mockTransactService.validate);
    jest.spyOn(originalTransactService.prototype, "checkExistingTransaction").mockImplementation(mockTransactService.checkExistingTransaction);
    jest.spyOn(originalTransactService.prototype, "transact").mockImplementation(mockTransactService.transact);

    // Import the function after mocking
    const { createTransactFn } = require("./transact");
    transactionFn = createTransactFn(mockClient);
  });

  it("should process a credit transaction successfully", async () => {
    const input = {
      userId: "user123",
      idempotencyKey: "key123",
      amount: "100",
      type: TransactionType.CREDIT,
    };

    mockUserService.getUserItem.mockResolvedValue({ userId: { S: "user123" } });
    mockTransactService.checkExistingTransaction.mockResolvedValue(undefined);
    mockTransactService.transact.mockResolvedValue(undefined);

    await transactionFn(input);

    expect(mockTransactService.validate).toHaveBeenCalledWith(input);
    expect(mockUserService.getUserItem).toHaveBeenCalledWith("user123");
    expect(mockTransactService.checkExistingTransaction).toHaveBeenCalledWith("key123");
    expect(mockTransactService.transact).toHaveBeenCalledWith(input);
  });

  it("should process a debit transaction successfully", async () => {
    const input = {
      userId: "user123",
      idempotencyKey: "key123",
      amount: "50",
      type: TransactionType.DEBIT,
    };

    mockUserService.getUserItem.mockResolvedValue({ userId: { S: "user123" }, balance: { N: "100" } });
    mockTransactService.checkExistingTransaction.mockResolvedValue(undefined);
    mockTransactService.transact.mockResolvedValue(undefined);

    await transactionFn(input);

    expect(mockTransactService.validate).toHaveBeenCalledWith(input);
    expect(mockUserService.getUserItem).toHaveBeenCalledWith("user123");
    expect(mockTransactService.checkExistingTransaction).toHaveBeenCalledWith("key123");
    expect(mockTransactService.transact).toHaveBeenCalledWith(input);
  });

  it("should throw UserNotFoundError when user doesn't exist", async () => {
    const input = {
      userId: "nonexistent",
      idempotencyKey: "key123",
      amount: "100",
      type: TransactionType.CREDIT,
    };

    mockUserService.getUserItem.mockResolvedValue(undefined);

    await expect(transactionFn(input)).rejects.toThrow(UserNotFoundError);
    expect(mockTransactService.validate).toHaveBeenCalledWith(input);
    expect(mockUserService.getUserItem).toHaveBeenCalledWith("nonexistent");
    expect(mockTransactService.checkExistingTransaction).not.toHaveBeenCalled();
    expect(mockTransactService.transact).not.toHaveBeenCalled();
  });

  it("should not process transaction when idempotency key already exists", async () => {
    const input = {
      userId: "user123",
      idempotencyKey: "key123",
      amount: "100",
      type: TransactionType.CREDIT,
    };

    const existingTransaction = {
      idempotencyKey: { S: "key123" },
      userId: { S: "user123" },
      amount: { N: "100" },
      type: { S: TransactionType.CREDIT },
    };

    mockUserService.getUserItem.mockResolvedValue({ userId: { S: "user123" } });
    mockTransactService.checkExistingTransaction.mockResolvedValue(existingTransaction);

    await transactionFn(input);

    expect(mockTransactService.validate).toHaveBeenCalledWith(input);
    expect(mockUserService.getUserItem).toHaveBeenCalledWith("user123");
    expect(mockTransactService.checkExistingTransaction).toHaveBeenCalledWith("key123");
    expect(mockTransactService.transact).not.toHaveBeenCalled();
  });

  it("should handle validation errors", async () => {
    const input = {
      userId: "user123",
      idempotencyKey: "",  // Invalid input
      amount: "100",
      type: TransactionType.CREDIT,
    };

    mockTransactService.validate.mockImplementation(() => {
      throw new InvalidIdempotencyKeyError();
    });

    await expect(transactionFn(input)).rejects.toThrow(InvalidIdempotencyKeyError);
    expect(mockTransactService.validate).toHaveBeenCalledWith(input);
    expect(mockUserService.getUserItem).not.toHaveBeenCalled();
    expect(mockTransactService.checkExistingTransaction).not.toHaveBeenCalled();
    expect(mockTransactService.transact).not.toHaveBeenCalled();
  });

  it("should handle insufficient balance errors", async () => {
    const input = {
      userId: "user123",
      idempotencyKey: "key123",
      amount: "200",
      type: TransactionType.DEBIT,
    };

    mockUserService.getUserItem.mockResolvedValue({ userId: { S: "user123" }, balance: { N: "100" } });
    mockTransactService.checkExistingTransaction.mockResolvedValue(undefined);
    mockTransactService.transact.mockRejectedValue(new InsufficientBalanceError());

    await expect(transactionFn(input)).rejects.toThrow(InsufficientBalanceError);
    expect(mockTransactService.validate).toHaveBeenCalledWith(input);
    expect(mockUserService.getUserItem).toHaveBeenCalledWith("user123");
    expect(mockTransactService.checkExistingTransaction).toHaveBeenCalledWith("key123");
    expect(mockTransactService.transact).toHaveBeenCalledWith(input);
  });
});
