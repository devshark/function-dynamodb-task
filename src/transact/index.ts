import { createTransactFn, TransactService } from "./transact";
import { client } from "../db/client";
import { Config } from "../config";
import { TransactionInput, TransactionType } from "../types";

async function main() {
  console.log("Starting application...");
  const transact = createTransactFn(client);

  const input = {
    idempotentKey: "1",
    userId: "11",
    amount: "10",
    type: TransactionType.CREDIT,
  };

  // const input = {
  //   idempotencyKey: "3",
  //   userId: "11",
  //   amount: "10",
  //   type: TransactionType.DEBIT,
  // };

  // const input = {
  //   idempotencyKey: "5",
  //   userId: "9",
  //   amount: "10",
  //   type: TransactionType.DEBIT,
  // };

  try {
    await transact(input);
  } catch (error) {
    throw error;
  }
}

// only run this script if it's executed directly and it's not imported as a module
if (process.argv[1] === __filename) {
  // script name is this file.
  main()
    .then(() => {
      console.log("Application finished successfully");
      process.exit(0); // exit with success status code
    })
    .catch((error) => {
      console.error("Error running application:", error);
      process.exit(1); // exit with success error code
    });
}
