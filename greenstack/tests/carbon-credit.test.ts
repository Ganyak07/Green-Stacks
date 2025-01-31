import {
  describe,
  beforeEach,
  it,
  expect,
  Client,
  Provider,
  ProviderRegistry,
  Result,
} from '@stacks/blockchain-api-client';
import { 
  standardPrincipalCV,
  uintCV,
  stringAsciiCV,
  someCV,
  noneCV,
  TupleCV
} from '@stacks/transactions';

describe('carbon-credit contract test suite', () => {
  let client: Client;
  let provider: Provider;
  const contractAddress = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM';
  const contractName = 'carbon-credit';
  const deployer = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM';
  const user1 = 'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG';
  const user2 = 'ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC';

  beforeEach(async () => {
    provider = await ProviderRegistry.createProvider();
    client = new Client(provider);
  });

  describe('project management', () => {
    it('successfully adds a new project', async () => {
      const args = [
        uintCV(1), // project-id
        stringAsciiCV('Solar Farm Alpha'), // name
        stringAsciiCV('Solar power project in Nevada'), // description
        uintCV(1000000), // total-credits
        uintCV(100000), // expiration
        uintCV(2000000), // price-per-credit
        stringAsciiCV('Nevada, USA'), // location
        stringAsciiCV('Solar') // category
      ];

      const tx = await client.callContract({
        contractAddress,
        contractName,
        functionName: 'add-project',
        functionArgs: args,
        senderAddress: deployer
      });

      expect(tx.success).toBe(true);
    });

    it('fails to add project with duplicate ID', async () => {
      // First project
      const args = [
        uintCV(1),
        stringAsciiCV('Solar Farm Alpha'),
        stringAsciiCV('Solar power project in Nevada'),
        uintCV(1000000),
        uintCV(100000),
        uintCV(2000000),
        stringAsciiCV('Nevada, USA'),
        stringAsciiCV('Solar')
      ];

      await client.callContract({
        contractAddress,
        contractName,
        functionName: 'add-project',
        functionArgs: args,
        senderAddress: deployer
      });

      // Try to add project with same ID
      const tx = await client.callContract({
        contractAddress,
        contractName,
        functionName: 'add-project',
        functionArgs: args,
        senderAddress: deployer
      });

      expect(tx.success).toBe(false);
      expect(tx.error).toBe('u107'); // ERR-PROJECT-EXISTS
    });
  });

  describe('minting', () => {
    beforeEach(async () => {
      // Setup: Add and verify a project
      const projectArgs = [
        uintCV(1),
        stringAsciiCV('Test Project'),
        stringAsciiCV('Test Description'),
        uintCV(1000000),
        uintCV(100000),
        uintCV(2000000),
        stringAsciiCV('Test Location'),
        stringAsciiCV('Test')
      ];

      await client.callContract({
        contractAddress,
        contractName,
        functionName: 'add-project',
        functionArgs: projectArgs,
        senderAddress: deployer
      });

      // Verify the project
      await client.callContract({
        contractAddress,
        contractName,
        functionName: 'verify-project',
        functionArgs: [uintCV(1)],
        senderAddress: deployer
      });
    });

    it('successfully mints tokens', async () => {
      const mintArgs = [
        uintCV(100000), // amount
        standardPrincipalCV(user1), // recipient
        uintCV(1) // project-id
      ];

      const tx = await client.callContract({
        contractAddress,
        contractName,
        functionName: 'mint',
        functionArgs: mintArgs,
        senderAddress: deployer
      });

      expect(tx.success).toBe(true);

      // Verify balance
      const balanceResponse = await client.callReadOnlyFunction({
        contractAddress,
        contractName,
        functionName: 'get-balance',
        functionArgs: [standardPrincipalCV(user1)]
      });

      expect(balanceResponse.value).toEqual(uintCV(100000));
    });
  });

  describe('transfers', () => {
    beforeEach(async () => {
      // Setup: Add project, verify, and mint tokens
      const projectArgs = [
        uintCV(1),
        stringAsciiCV('Transfer Test Project'),
        stringAsciiCV('Test Description'),
        uintCV(1000000),
        uintCV(100000),
        uintCV(2000000),
        stringAsciiCV('Test Location'),
        stringAsciiCV('Test')
      ];

      await client.callContract({
        contractAddress,
        contractName,
        functionName: 'add-project',
        functionArgs: projectArgs,
        senderAddress: deployer
      });

      await client.callContract({
        contractAddress,
        contractName,
        functionName: 'verify-project',
        functionArgs: [uintCV(1)],
        senderAddress: deployer
      });

      await client.callContract({
        contractAddress,
        contractName,
        functionName: 'mint',
        functionArgs: [uintCV(100000), standardPrincipalCV(user1), uintCV(1)],
        senderAddress: deployer
      });
    });

    it('successfully transfers tokens', async () => {
      const transferArgs = [
        uintCV(50000), // amount
        standardPrincipalCV(user1), // sender
        standardPrincipalCV(user2), // recipient
        uintCV(1) // project-id
      ];

      const tx = await client.callContract({
        contractAddress,
        contractName,
        functionName: 'transfer',
        functionArgs: transferArgs,
        senderAddress: user1
      });

      expect(tx.success).toBe(true);

      // Verify balances
      const sender_balance = await client.callReadOnlyFunction({
        contractAddress,
        contractName,
        functionName: 'get-balance',
        functionArgs: [standardPrincipalCV(user1)]
      });

      const recipient_balance = await client.callReadOnlyFunction({
        contractAddress,
        contractName,
        functionName: 'get-balance',
        functionArgs: [standardPrincipalCV(user2)]
      });

      expect(sender_balance.value).toEqual(uintCV(50000));
      expect(recipient_balance.value).toEqual(uintCV(50000));
    });
  });

  describe('project verification', () => {
    it('only allows owner to verify projects', async () => {
      // Add project first
      const projectArgs = [
        uintCV(1),
        stringAsciiCV('Verify Test Project'),
        stringAsciiCV('Test Description'),
        uintCV(1000000),
        uintCV(100000),
        uintCV(2000000),
        stringAsciiCV('Test Location'),
        stringAsciiCV('Test')
      ];

      await client.callContract({
        contractAddress,
        contractName,
        functionName: 'add-project',
        functionArgs: projectArgs,
        senderAddress: deployer
      });

      // Try to verify with non-owner
      const tx = await client.callContract({
        contractAddress,
        contractName,
        functionName: 'verify-project',
        functionArgs: [uintCV(1)],
        senderAddress: user1
      });

      expect(tx.success).toBe(false);
      expect(tx.error).toBe('u100'); // ERR-OWNER-ONLY
    });
  });
});