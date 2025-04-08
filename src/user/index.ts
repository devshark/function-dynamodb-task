import { UserService } from "./user";
import { client } from "../db/client";
import { Config } from "../config";

async function main() {
  console.log("Starting application...");
  const userService = new UserService(client, Config);

  const input = {
    userId: "1",
  };

  try {
    const balance = await userService.getUserBalance(input);
    console.error(`User ${input.userId}'s balance is ${balance}`);
  } catch (error) {
    console.error(`User ${input.userId} not found:`, error);
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
