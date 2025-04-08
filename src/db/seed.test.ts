import { DynamoDB, BatchWriteItemCommandInput } from "@aws-sdk/client-dynamodb";
import { Config } from "../config";

// Mock the Config to avoid external dependencies
jest.mock("../config", () => ({
  Config: {
    DEFAULT_CURRENCY: "USD",
    DB_USERS_TABLE: "users-table",
    USER_SEED_SIZE: 10
  }
}));

// Mock the DynamoDB client
jest.mock("@aws-sdk/client-dynamodb", () => {
  const mockBatchWriteItem = jest.fn();
  return {
    DynamoDB: jest.fn().mockImplementation(() => ({
      batchWriteItem: mockBatchWriteItem
    }))
  };
});

describe("seed", () => {
  let mockClient: DynamoDB;
  let seedFunction: (client: DynamoDB, size: number) => Promise<void>;
  
  // Setup before each test
  beforeEach(() => {
    // Clear mocks
    jest.clearAllMocks();
    
    // Mock console methods for testing
    console.log = jest.fn();
    console.info = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
    
    // Create a new mock client
    mockClient = new DynamoDB({});
    
    // Import the seed function (need to re-import to reset module state)
    jest.isolateModules(() => {
      // We need to export the seed function from the original module for testing
      // So we'll modify the import to get access to the seed function directly
      const seedModule = require("./seed");
      seedFunction = seedModule.seed;
    });
  });
  
  it("should create the expected number of user records", async () => {
    // Setup mock response
    const mockResponse = {
      UnprocessedItems: {},
      ConsumedCapacity: [{ TableName: "users-table", CapacityUnits: 10 }]
    };
    (mockClient.batchWriteItem as jest.Mock).mockResolvedValueOnce(mockResponse);
    
    // Call the seed function
    await seedFunction(mockClient, 5);
    
    // Verify batchWriteItem was called
    expect(mockClient.batchWriteItem).toHaveBeenCalledTimes(1);
    
    // Get the parameters passed to batchWriteItem
    const params: BatchWriteItemCommandInput = (mockClient.batchWriteItem as jest.Mock).mock.calls[0][0];
    
    // Verify the parameters
    expect(params.RequestItems).toBeDefined();
    expect(params.RequestItems[Config.DB_USERS_TABLE]).toHaveLength(5);
    expect(params.ReturnItemCollectionMetrics).toBe("SIZE");
    expect(params.ReturnConsumedCapacity).toBe("TOTAL");
  });

  it("should log unprocessed items if any", async () => {
    // Setup mock response with unprocessed items
    const unprocessedItem = {
      PutRequest: {
        Item: {
          userId: { S: "1" },
          balance: { N: "100" },
          currency: { S: "USD" }
        }
      }
    };
    
    const mockResponse = {
      UnprocessedItems: {
        [Config.DB_USERS_TABLE]: [unprocessedItem]
      },
      ConsumedCapacity: [{ TableName: "users-table", CapacityUnits: 10 }]
    };
    
    (mockClient.batchWriteItem as jest.Mock).mockResolvedValueOnce(mockResponse);
    
    // Call the seed function
    await seedFunction(mockClient, 3);
    
    // Verify console.warn was called for unprocessed items
    expect(console.warn).toHaveBeenCalledWith(`Unprocessed item: ${JSON.stringify(unprocessedItem)}`);
  });

  it("should handle empty response gracefully", async () => {
    // Setup mock response with minimal data
    const mockResponse = {};
    (mockClient.batchWriteItem as jest.Mock).mockResolvedValueOnce(mockResponse);
    
    // Call the seed function
    await seedFunction(mockClient, 2);
    
    // Verify it didn't throw an error
    expect(mockClient.batchWriteItem).toHaveBeenCalledTimes(1);
  });

  it("should generate items with both numeric and null balances", async () => {
    // Setup mock for Math.random to control the output
    const originalRandom = Math.random;
    
    // First call for haveBalance check, second for balance amount
    Math.random = jest.fn()
      .mockReturnValueOnce(0.8) // > 0.5, so first item has balance
      .mockReturnValueOnce(0.5) // Balance value
      .mockReturnValueOnce(0.2) // < 0.5, so second item has null balance
      .mockReturnValueOnce(0.3); // Not used
    
    const mockResponse = { UnprocessedItems: {} };
    (mockClient.batchWriteItem as jest.Mock).mockResolvedValueOnce(mockResponse);
    
    // Call the seed function
    await seedFunction(mockClient, 2);
    
    // Get the parameters passed to batchWriteItem
    const params: BatchWriteItemCommandInput = (mockClient.batchWriteItem as jest.Mock).mock.calls[0][0];
    const items = params.RequestItems[Config.DB_USERS_TABLE];
    
    // Verify first item has numeric balance
    expect(items[0].PutRequest.Item.balance.N).toBeDefined();
    
    // Verify second item has null balance
    expect(items[1].PutRequest.Item.balance).toBeUndefined();
    
    // Restore Math.random
    Math.random = originalRandom;
  });
}); 