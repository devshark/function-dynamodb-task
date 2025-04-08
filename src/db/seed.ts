import { BatchWriteItemCommandInput, DynamoDB } from "@aws-sdk/client-dynamodb";
import { Config } from "../config";
import { client } from "./client";

// seed the users database.
// @param size is the number of documents to create in the database
export async function seed(client: DynamoDB, size: number): Promise<void> {
  const putRequests = Array.from({ length: size }).map((_, i) => {
    const haveBalance = Math.random() > 0.5;
    return {
      PutRequest: {
        Item: {
          userId: { S: `${i + 1}` },
          ...(haveBalance && {
            balance: { N: (Math.random() * 10_000).toFixed(2) },
          }),
          currency: { S: Config.DEFAULT_CURRENCY },
        },
      },
    };
  });

  const params: BatchWriteItemCommandInput = {
    RequestItems: {
      [Config.DB_USERS_TABLE]: putRequests,
    },
    ReturnItemCollectionMetrics: "SIZE",
    ReturnConsumedCapacity: "TOTAL",
  };

  console.log(params);

  const result = await client.batchWriteItem(params);

  result.UnprocessedItems?.[Config.DB_USERS_TABLE]?.forEach((item) => {
    console.warn(`Unprocessed item: ${JSON.stringify(item)}`);
  });
  console.info(`Seeded ${putRequests.length} users`);
  console.info(`Unprocessed items: ${JSON.stringify(result.UnprocessedItems)}`);
  console.info(`Consumed capacity: ${JSON.stringify(result.ConsumedCapacity)}`);
}

// Only run the seed function if this file is executed directly
if (require.main === module) {
  seed(client, Config.USER_SEED_SIZE)
    .then(() => console.info("Seed completed"))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
