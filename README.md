# Simple Transactions with DynamoDB

This is a simple example of how to use DynamoDB for transactions. It's not meant to be production ready, but it should give you an idea on how to do things.

## How does it work?

1. We have two tables: `Users` and `Transactions`.
2. The `Users` table has a primary unique index on `userId`. Additional optional attributes are `balance` and `currency`.
3. The `Transactions` table has three attributes: `idempotencyKey`, `userId`, `amount`, `type`, and `timestamp`. Each request is checked if a transaction with the given idempotent key already exists.
4. We have wrapper functions that returns a facade around DynamoDB operations.
5. Schema definition for creating the tables are in [Schema directory](./src/schema/).
6. DynamoDB singleton client is [here](./src/db//client.ts)
7. Seeding for test data is in [Seeding directory](./src/db/seed.ts)

## Setup

1. Run the dynamodb docker container using `docker-compose up`
2. Open a new terminal and install using `npm install`
3. When the dynamodb server is up and running, run the migrations using `npm run migrate`
4. Then populate test user data using `npm run seed`
5. Some User function scripts are prepared in [User Index](./src//user/index.ts) and can be ran using `npm run run:user`
5. Some Transaction function scripts are prepared in [Transact Index](./src//transact/index.ts) and can be ran using `npm run run:transact`

## Assumptions

1. That `getUserBalance` isn't supposed to backfill/write the default balance for users that don't have one. It seems like it's only purpose is to return a value and not mutate any data.
2. That `transact` method isn't supposed to carry the Task 1's case of "100 USD balance". It seems to be the responsible of a different function. 
3. That `idempotentKey` is the only attribute needed to determine if a transaction already exists. It should be the client's responsibility to ensure they pass unique `idempotentKey` for each request. i.e. `idempotentKey` isn't reused for double-entry ledgers, at least it's different for each side of the account.
4. That we don't want the running balance for each entry in the `Transactions` table.

## If I had more time, I would:

1. Write better tests. Mocking feels like a cheat and doesn't really simulate real usage.
2. Document them better i.e. better and cleaner comments.
3. Fix the broken tests brought by mocking the Dynamodb calls.