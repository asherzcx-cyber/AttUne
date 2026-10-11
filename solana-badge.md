# Solana devnet completion badge

For the hackathon demo, use Solana **devnet** only. A user can connect a browser wallet such as Phantom and sign a completion proof after an attention-training session. The proof should contain no EEG values or health information—only a random session ID and the completion time.

Suggested proof message:

```text
AttUne completion proof | session: <random-id> | completed: <ISO timestamp>
```

To make this an on-chain transaction, use a browser wallet to submit a devnet Memo Program instruction with that message. The wallet, not the browser app, must hold and sign with the user's private key. Never store a wallet seed phrase or private key in `.env`, the database, or source code.

Use the Solana devnet faucet to obtain test SOL for transaction fees. Save only the public wallet address and transaction signature in your application database.
