import { DynamoDBClient, GetItemCommandOutput } from "@aws-sdk/client-dynamodb";
import { createUserBalanceFn, UserService } from "./user";
import { TConfig, InvalidUserIdError, UserNotFoundError, UserBalanceFunction } from "../types";

// Mock the DynamoDBClient
jest.mock("@aws-sdk/client-dynamodb", () => {
  const mockSend = jest.fn();
  return {
    DynamoDBClient: jest.fn().mockImplementation(() => ({
      send: mockSend,
    })),
    GetItemCommand: jest.fn().mockImplementation((params) => params),
  };
});

describe("UserService", () => {
  let userService: UserService;
  let mockDb: DynamoDBClient;
  let mockConfig: TConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = {
      DEFAULT_BALANCE: 100,
      DEFAULT_CURRENCY: "USD",
      DB_USERS_TABLE: "users-table",
    } as TConfig;

    mockDb = new DynamoDBClient({});
    userService = new UserService(mockDb, mockConfig);
  });

  describe("getUserBalance", () => {
    it("should throw InvalidUserIdError when userId is not provided", async () => {
      await expect(userService.getUserBalance({} as any)).rejects.toThrow(
        InvalidUserIdError
      );
    });

    it("should return user balance when user exists", async () => {
      // Setup the mock response
      const mockResponse: Partial<GetItemCommandOutput> = {
        Item: {
          balance: { N: "200" },
          currency: { S: "EUR" },
        },
      };

      (mockDb.send as jest.Mock).mockResolvedValueOnce(mockResponse);

      const result = await userService.getUserBalance({ userId: "user123" });

      expect(mockDb.send).toHaveBeenCalledTimes(1);
      expect(result).toBe("200 EUR");
    });

    it("should return default balance when user balance is undefined", async () => {
        // Setup the mock response with null balance
        const mockResponse: Partial<GetItemCommandOutput> = {
          Item: {
          },
        };
  
        (mockDb.send as jest.Mock).mockResolvedValueOnce(mockResponse);
  
        const result = await userService.getUserBalance({ userId: "user123" });
  
        expect(mockDb.send).toHaveBeenCalledTimes(1);
        expect(result).toBe("100 USD");
      });
  
      it("should return default balance when user currency is undefined", async () => {
        // Setup the mock response with null balance
        const mockResponse: Partial<GetItemCommandOutput> = {
          Item: {
            balance: { N: "200" },
          },
        };
  
        (mockDb.send as jest.Mock).mockResolvedValueOnce(mockResponse);
  
        const result = await userService.getUserBalance({ userId: "user123" });
  
        expect(mockDb.send).toHaveBeenCalledTimes(1);
        expect(result).toBe("200 USD");
      });
  
    it("should throw UserNotFoundError when user does not exist", async () => {
      // Setup the mock response for user not found
      const mockResponse: Partial<GetItemCommandOutput> = {
        Item: undefined,
      };

      (mockDb.send as jest.Mock).mockResolvedValueOnce(mockResponse);

      await expect(
        userService.getUserBalance({ userId: "nonexistentUser" })
      ).rejects.toThrow(UserNotFoundError);

      expect(mockDb.send).toHaveBeenCalledTimes(1);
    });

    it("should use the correct table name from config", async () => {
      const mockResponse: Partial<GetItemCommandOutput> = {
        Item: {
          balance: { N: "200" },
          currency: { S: "EUR" },
        },
      };

      (mockDb.send as jest.Mock).mockResolvedValueOnce(mockResponse);

      await userService.getUserBalance({ userId: "user123" });

      expect(mockDb.send).toHaveBeenCalledWith({
        TableName: "users-table",
        Key: {
          userId: { S: "user123" },
        },
      });
    });
  });

  describe("getUserItem", () => {
    it("should successfully retrieve a user item from DynamoDB", async () => {
      // Setup the mock response
      const mockResponse: Partial<GetItemCommandOutput> = {
        Item: {
          userId: { S: "user123" },
          balance: { N: "200" },
          currency: { S: "EUR" },
        },
      };

      (mockDb.send as jest.Mock).mockResolvedValueOnce(mockResponse);

      const result = await userService.getUserItem("user123");

      expect(mockDb.send).toHaveBeenCalledTimes(1);
      expect(mockDb.send).toHaveBeenCalledWith({
        TableName: "users-table",
        Key: {
          userId: { S: "user123" },
        },
      });
      expect(result).toEqual(mockResponse.Item);
    });

    it("should return undefined when user does not exist", async () => {
      // Setup the mock response for user not found
      const mockResponse: Partial<GetItemCommandOutput> = {
        Item: undefined,
      };

      (mockDb.send as jest.Mock).mockResolvedValueOnce(mockResponse);

      const result = await userService.getUserItem("nonexistentUser");

      expect(mockDb.send).toHaveBeenCalledTimes(1);
      expect(result).toBeUndefined();
    });

    it("should handle DynamoDB errors", async () => {
      // Setup the mock to throw an error
      const error = new Error("DynamoDB error");
      (mockDb.send as jest.Mock).mockRejectedValueOnce(error);

      await expect(userService.getUserItem("user123")).rejects.toThrow("DynamoDB error");
      expect(mockDb.send).toHaveBeenCalledTimes(1);
    });

    it("should use the correct table name from config", async () => {
      // Setup the mock response
      const mockResponse: Partial<GetItemCommandOutput> = {
        Item: {
          userId: { S: "user123" },
          balance: { N: "200" },
          currency: { S: "EUR" },
        },
      };

      (mockDb.send as jest.Mock).mockResolvedValueOnce(mockResponse);

      await userService.getUserItem("user123");

      expect(mockDb.send).toHaveBeenCalledWith({
        TableName: "users-table",
        Key: {
          userId: { S: "user123" },
        },
      });
    });
  });
});


describe("createUserBalanceFn", () => {
  let userBalanceFn: UserBalanceFunction;
  let mockDb: DynamoDBClient;
  let mockConfig: TConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = {
      DEFAULT_BALANCE: 100,
      DEFAULT_CURRENCY: "USD",
      DB_USERS_TABLE: "users-table",
    } as TConfig;

    mockDb = new DynamoDBClient({});
    userBalanceFn = createUserBalanceFn(mockDb, mockConfig);
  });

  describe("getUserBalance", () => {
    it("should throw InvalidUserIdError when userId is not provided", async () => {
      await expect(userBalanceFn({} as any)).rejects.toThrow(
        InvalidUserIdError
      );
    });

    it("should return user balance when user exists", async () => {
      // Setup the mock response
      const mockResponse: Partial<GetItemCommandOutput> = {
        Item: {
          balance: { N: "200" },
          currency: { S: "EUR" },
        },
      };

      (mockDb.send as jest.Mock).mockResolvedValueOnce(mockResponse);

      const result = await userBalanceFn({ userId: "user123" });

      expect(mockDb.send).toHaveBeenCalledTimes(1);
      expect(result).toBe("200 EUR");
    });

    it("should return default balance when user balance is undefined", async () => {
        // Setup the mock response with null balance
        const mockResponse: Partial<GetItemCommandOutput> = {
          Item: {
          },
        };
  
        (mockDb.send as jest.Mock).mockResolvedValueOnce(mockResponse);
  
        const result = await userBalanceFn({ userId: "user123" });
  
        expect(mockDb.send).toHaveBeenCalledTimes(1);
        expect(result).toBe("100 USD");
      });
  
      it("should return default balance when user currency is undefined", async () => {
        // Setup the mock response with null balance
        const mockResponse: Partial<GetItemCommandOutput> = {
          Item: {
            balance: { N: "200" },
          },
        };
  
        (mockDb.send as jest.Mock).mockResolvedValueOnce(mockResponse);
  
        const result = await userBalanceFn({ userId: "user123" });
  
        expect(mockDb.send).toHaveBeenCalledTimes(1);
        expect(result).toBe("200 USD");
      });
  
    it("should throw UserNotFoundError when user does not exist", async () => {
      // Setup the mock response for user not found
      const mockResponse: Partial<GetItemCommandOutput> = {
        Item: undefined,
      };

      (mockDb.send as jest.Mock).mockResolvedValueOnce(mockResponse);

      await expect(
        userBalanceFn({ userId: "nonexistentUser" })
      ).rejects.toThrow(UserNotFoundError);

      expect(mockDb.send).toHaveBeenCalledTimes(1);
    });

    it("should use the correct table name from config", async () => {
      const mockResponse: Partial<GetItemCommandOutput> = {
        Item: {
          balance: { N: "200" },
          currency: { S: "EUR" },
        },
      };

      (mockDb.send as jest.Mock).mockResolvedValueOnce(mockResponse);

      await userBalanceFn({ userId: "user123" });

      expect(mockDb.send).toHaveBeenCalledWith({
        TableName: "users-table",
        Key: {
          userId: { S: "user123" },
        },
      });
    });
  });
});

