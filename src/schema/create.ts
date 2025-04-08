import { CreateTableCommandInput } from "@aws-sdk/client-dynamodb";
import { client } from "../db/client";
import { Config } from "../config";

export const createTable = async (params: CreateTableCommandInput) => {
  try {
    const result = await client.createTable(params);
    if (result.$metadata.httpStatusCode === 200) {
      console.info(`Table ${params.TableName} created successfully`);
    }
  } catch (err) {
    console.error(`Error creating table ${params.TableName}:`, err);
    throw err;
  }
};


export const createTransactionsSchema = async () => {
  const params: CreateTableCommandInput = {
    TableName: Config.DB_TRANSACTIONS_TABLE,
    AttributeDefinitions: [
      {
        AttributeName: "idempotencyKey",
        AttributeType: "S",
      },
      {
        AttributeName: "userId",
        AttributeType: "S",
      },
    ],
    KeySchema: [
      {
        AttributeName: "idempotencyKey",
        KeyType: "HASH",
      },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: "userIdIndex", // Choose a unique name for your index
        KeySchema: [
          {
            AttributeName: "userId",
            KeyType: "HASH",
          },
        ],
        Projection: {
          ProjectionType: "ALL", // Include all attributes in the GSI
        },
        ProvisionedThroughput: {
          // Provisioned throughput for the GSI
          ReadCapacityUnits: 1,
          WriteCapacityUnits: 1,
        }
      },
    ],
    ProvisionedThroughput: {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 5,
    },
  };

  await createTable(params);
};


export const createUsersSchema = async () => {
    const params: CreateTableCommandInput = {
      TableName: Config.DB_USERS_TABLE,
      AttributeDefinitions: [
        {
          AttributeName: "userId",
          AttributeType: "S",
        },
      ],
      KeySchema: [
        {
          AttributeName: "userId",
          KeyType: "HASH",
        },
      ],
      ProvisionedThroughput: {
        ReadCapacityUnits: 1,
        WriteCapacityUnits: 1,
      },
    };
  
    await createTable(params);
  };
  