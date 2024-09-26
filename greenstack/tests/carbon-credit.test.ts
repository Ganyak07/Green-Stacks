import { Clarinet, Tx, Chain, Account, types } from 'https://deno.land/x/clarinet@v1.0.0/index.ts';
import { assertEquals } from 'https://deno.land/std@0.90.0/testing/asserts.ts';

Clarinet.test({
    name: "Ensure that contract owner can add a new project",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const wallet1 = accounts.get('wallet_1')!;

        let block = chain.mineBlock([
            Tx.contractCall('carbon-credit', 'add-project', [types.uint(1), types.ascii("Test Project"), types.ascii("Test Description"), types.uint(10000)], deployer.address)
        ]);
        assertEquals(block.receipts.length, 1);
        assertEquals(block.height, 2);
        block.receipts[0].result.expectOk().expectBool(true);

        // Non-owner cannot add a project
        block = chain.mineBlock([
            Tx.contractCall('carbon-credit', 'add-project', [types.uint(2), types.ascii("Test Project 2"), types.ascii("Test Description 2"), types.uint(20000)], wallet1.address)
        ]);
        block.receipts[0].result.expectErr().expectUint(100);
    },
});

Clarinet.test({
    name: "Ensure that verifier can verify a project",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const wallet1 = accounts.get('wallet_1')!;

        let block = chain.mineBlock([
            Tx.contractCall('carbon-credit', 'add-project', [types.uint(1), types.ascii("Test Project"), types.ascii("Test Description"), types.uint(10000)], deployer.address),
            Tx.contractCall('carbon-credit', 'verify-project', [types.uint(1)], deployer.address)
        ]);
        assertEquals(block.receipts.length, 2);
        block.receipts[1].result.expectOk().expectBool(true);

        // Non-verifier cannot verify a project
        block = chain.mineBlock([
            Tx.contractCall('carbon-credit', 'verify-project', [types.uint(1)], wallet1.address)
        ]);
        block.receipts[0].result.expectErr().expectUint(100);
    },
});

Clarinet.test({
    name: "Ensure that contract owner can mint tokens",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const wallet1 = accounts.get('wallet_1')!;

        let block = chain.mineBlock([
            Tx.contractCall('carbon-credit', 'add-project', [types.uint(1), types.ascii("Test Project"), types.ascii("Test Description"), types.uint(10000)], deployer.address),
            Tx.contractCall('carbon-credit', 'verify-project', [types.uint(1)], deployer.address),
            Tx.contractCall('carbon-credit', 'mint', [types.uint(1000), types.principal(wallet1.address), types.uint(1)], deployer.address)
        ]);
        assertEquals(block.receipts.length, 3);
        block.receipts[2].result.expectOk().expectBool(true);

        // Check balance
        block = chain.mineBlock([
            Tx.contractCall('carbon-credit', 'get-credit-balance', [types.principal(wallet1.address), types.uint(1)], wallet1.address)
        ]);
        block.receipts[0].result.expectOk().expectUint(1000);

        // Non-owner cannot mint
        block = chain.mineBlock([
            Tx.contractCall('carbon-credit', 'mint', [types.uint(1000), types.principal(wallet1.address), types.uint(1)], wallet1.address)
        ]);
        block.receipts[0].result.expectErr().expectUint(100);
    },
});

Clarinet.test({
    name: "Ensure that users can transfer tokens",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const wallet1 = accounts.get('wallet_1')!;
        const wallet2 = accounts.get('wallet_2')!;

        let block = chain.mineBlock([
            Tx.contractCall('carbon-credit', 'add-project', [types.uint(1), types.ascii("Test Project"), types.ascii("Test Description"), types.uint(10000)], deployer.address),
            Tx.contractCall('carbon-credit', 'verify-project', [types.uint(1)], deployer.address),
            Tx.contractCall('carbon-credit', 'mint', [types.uint(1000), types.principal(wallet1.address), types.uint(1)], deployer.address),
            Tx.contractCall('carbon-credit', 'transfer', [types.uint(500), types.principal(wallet1.address), types.principal(wallet2.address), types.uint(1)], wallet1.address)
        ]);
        assertEquals(block.receipts.length, 4);
        block.receipts[3].result.expectOk().expectBool(true);

        // Check balances
        block = chain.mineBlock([
            Tx.contractCall('carbon-credit', 'get-credit-balance', [types.principal(wallet1.address), types.uint(1)], wallet1.address),
            Tx.contractCall('carbon-credit', 'get-credit-balance', [types.principal(wallet2.address), types.uint(1)], wallet2.address)
        ]);
        block.receipts[0].result.expectOk().expectUint(500);
        block.receipts[1].result.expectOk().expectUint(500);
    },
});

Clarinet.test({
    name: "Ensure that users can retire tokens",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const wallet1 = accounts.get('wallet_1')!;

        let block = chain.mineBlock([
            Tx.contractCall('carbon-credit', 'add-project', [types.uint(1), types.ascii("Test Project"), types.ascii("Test Description"), types.uint(10000)], deployer.address),
            Tx.contractCall('carbon-credit', 'verify-project', [types.uint(1)], deployer.address),
            Tx.contractCall('carbon-credit', 'mint', [types.uint(1000), types.principal(wallet1.address), types.uint(1)], deployer.address),
            Tx.contractCall('carbon-credit', 'retire', [types.uint(500), types.principal(wallet1.address), types.uint(1)], wallet1.address)
        ]);
        assertEquals(block.receipts.length, 4);
        block.receipts[3].result.expectOk().expectBool(true);

        // Check balance
        block = chain.mineBlock([
            Tx.contractCall('carbon-credit', 'get-credit-balance', [types.principal(wallet1.address), types.uint(1)], wallet1.address)
        ]);
        block.receipts[0].result.expectOk().expectUint(500);

        // Check total supply
        block = chain.mineBlock([
            Tx.contractCall('carbon-credit', 'get-total-supply', [], wallet1.address)
        ]);
        block.receipts[0].result.expectOk().expectUint(500);
    },
});

Clarinet.test({
    name: "Ensure that project details can be retrieved",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;

        let block = chain.mineBlock([
            Tx.contractCall('carbon-credit', 'add-project', [types.uint(1), types.ascii("Test Project"), types.ascii("Test Description"), types.uint(10000)], deployer.address),
            Tx.contractCall('carbon-credit', 'verify-project', [types.uint(1)], deployer.address),
            Tx.contractCall('carbon-credit', 'get-project', [types.uint(1)], deployer.address)
        ]);
        assertEquals(block.receipts.length, 3);
        const projectDetails = block.receipts[2].result.expectOk().expectSome();
        assertEquals(projectDetails['name'], "Test Project");
        assertEquals(projectDetails['description'], "Test Description");
        assertEquals(projectDetails['total-credits'], "10000");
        assertEquals(projectDetails['verified'], true);
    },
});

Clarinet.test({
    name: "Ensure that minting fails for unverified projects",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const wallet1 = accounts.get('wallet_1')!;

        let block = chain.mineBlock([
            Tx.contractCall('carbon-credit', 'add-project', [types.uint(1), types.ascii("Test Project"), types.ascii("Test Description"), types.uint(10000)], deployer.address),
            Tx.contractCall('carbon-credit', 'mint', [types.uint(1000), types.principal(wallet1.address), types.uint(1)], deployer.address)
        ]);
        assertEquals(block.receipts.length, 2);
        block.receipts[1].result.expectErr().expectUint(106);
    },
});

Clarinet.test({
    name: "Ensure that minting fails if amount exceeds project credits",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const wallet1 = accounts.get('wallet_1')!;

        let block = chain.mineBlock([
            Tx.contractCall('carbon-credit', 'add-project', [types.uint(1), types.ascii("Test Project"), types.ascii("Test Description"), types.uint(10000)], deployer.address),
            Tx.contractCall('carbon-credit', 'verify-project', [types.uint(1)], deployer.address),
            Tx.contractCall('carbon-credit', 'mint', [types.uint(20000), types.principal(wallet1.address), types.uint(1)], deployer.address)
        ]);
        assertEquals(block.receipts.length, 3);
        block.receipts[2].result.expectErr().expectUint(103);
    },
});