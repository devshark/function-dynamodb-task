import { client } from "../db/client";
import { Config } from "../config";
import { createTransactionsSchema, createUsersSchema } from "./create";

// returns true if the table exists, false otherwise
export async function checkTableExists(tableName: string) {
  try {
    const response = await client.listTables().then((data) => data.TableNames);
    if (response && response.includes(tableName)) {
      return true;
    } else {
      return false;
    }
  } catch (err) {
    console.log(err);
    return false;
  }
}

// creates the Users and Transactions tables if they do not exist
const createSchema = async () => {
  console.log("Creating schema...");
  if ((await checkTableExists(Config.DB_USERS_TABLE)) === false) {
    await createUsersSchema();
  }

  if ((await checkTableExists(Config.DB_TRANSACTIONS_TABLE)) === false) {
    await createTransactionsSchema();
  }
};

// only run this script if it's executed directly and it's not imported as a module
if (process.argv[1] === __filename) {
  // script name is this file.
  createSchema()
    .then(() => {
      console.log("Schema created successfully");
      process.exit(0); // exit with success status code
    })
    .catch((error) => {
      console.error("Error creating schema:", error);
      process.exit(1); // exit with success error code
    });
}
