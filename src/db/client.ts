import { DynamoDB } from "@aws-sdk/client-dynamodb";

// singleton client for local DynamoDB
export const client = new DynamoDB({ endpoint: "http://localhost:18000", region: "us-east-1" });
