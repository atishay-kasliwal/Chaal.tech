// Per-room ledger on Durable Object SQLite. One room object owns one ledger, so
// serialization comes from the object being single-threaded plus a SQLite transaction.

export type TxType = 'MINT' | 'BOOT' | 'BET' | 'POT_WIN' | 'GIFT' | 'PLAYER_LOAN' | 'PLAYER_REPAYMENT' | 'BANK_LOAN' | 'BANK_REPAYMENT';
export type TransferResult =
  | { ok: true; duplicate: boolean }
  | { ok: false; reason: 'insufficient_funds' | 'unknown_account' | 'invalid_amount' | 'same_account' | 'rolled_back' };

export class Ledger {
  rowsRead = 0;
  rowsWritten = 0;

  constructor(
    private readonly sql: SqlStorage,
    private readonly transaction: <T>(fn: () => T) => T,
  ) {}

  init(): void {
    this.run(`CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, balance INTEGER NOT NULL CHECK (balance >= 0))`);
    this.run(`CREATE TABLE IF NOT EXISTS transactions (
      seq INTEGER PRIMARY KEY AUTOINCREMENT, op_key TEXT NOT NULL UNIQUE, type TEXT NOT NULL,
      from_acc TEXT, to_acc TEXT NOT NULL, amount INTEGER NOT NULL CHECK (amount > 0), created_at INTEGER NOT NULL)`);
  }

  private run(query: string, ...bindings: (string | number | null)[]): Record<string, SqlStorageValue>[] {
    const cursor = this.sql.exec(query, ...bindings);
    const rows = cursor.toArray();
    this.rowsRead += cursor.rowsRead;
    this.rowsWritten += cursor.rowsWritten;
    return rows;
  }

  private exists(opKey: string): boolean {
    return this.run('SELECT 1 AS x FROM transactions WHERE op_key = ?', opKey).length > 0;
  }

  openAccount(id: string, kind: string): void {
    this.run('INSERT OR IGNORE INTO accounts (id, kind, balance) VALUES (?, ?, 0)', id, kind);
  }

  mint(opKey: string, to: string, amount: number, kind = 'player'): TransferResult {
    if (!Number.isSafeInteger(amount) || amount <= 0) return { ok: false, reason: 'invalid_amount' };
    return this.transaction(() => {
      if (this.exists(opKey)) return { ok: true, duplicate: true } as const;
      this.openAccount(to, kind);
      this.run('UPDATE accounts SET balance = balance + ? WHERE id = ?', amount, to);
      this.run('INSERT INTO transactions (op_key, type, from_acc, to_acc, amount, created_at) VALUES (?, ?, NULL, ?, ?, ?)',
        opKey, 'MINT', to, amount, Date.now());
      return { ok: true, duplicate: false } as const;
    });
  }

  /** `crashAfterDebit` is a test hook: throws after the debit to prove the transaction rolls back. */
  transfer(opKey: string, type: TxType, from: string, to: string, amount: number, crashAfterDebit = false): TransferResult {
    if (!Number.isSafeInteger(amount) || amount <= 0) return { ok: false, reason: 'invalid_amount' };
    if (from === to) return { ok: false, reason: 'same_account' };
    try {
      return this.transaction(() => {
        if (this.exists(opKey)) return { ok: true, duplicate: true } as const;
        const known = this.run('SELECT id FROM accounts WHERE id IN (?, ?)', from, to);
        if (known.length !== 2) throw new LedgerError('unknown_account');
        this.run('UPDATE accounts SET balance = balance - ? WHERE id = ?', amount, from);
        if (crashAfterDebit) throw new Error('injected failure after debit');
        this.run('UPDATE accounts SET balance = balance + ? WHERE id = ?', amount, to);
        this.run('INSERT INTO transactions (op_key, type, from_acc, to_acc, amount, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          opKey, type, from, to, amount, Date.now());
        return { ok: true, duplicate: false } as const;
      });
    } catch (error) {
      if (error instanceof LedgerError) return { ok: false, reason: error.reason };
      if (String(error).includes('CHECK constraint failed')) return { ok: false, reason: 'insufficient_funds' };
      if (String(error).includes('injected failure')) return { ok: false, reason: 'rolled_back' };
      throw error;
    }
  }

  balances(): Record<string, number> {
    return Object.fromEntries(this.run('SELECT id, balance FROM accounts').map((r) => [r.id as string, r.balance as number]));
  }

  /** Recomputes every balance from the transaction log and compares with the cached column. */
  verify(): { ok: boolean; totalBalances: number; totalMinted: number; mismatches: string[] } {
    const rows = this.run(`SELECT a.id AS id, a.balance AS cached,
        COALESCE((SELECT SUM(amount) FROM transactions WHERE to_acc = a.id), 0)
      - COALESCE((SELECT SUM(amount) FROM transactions WHERE from_acc = a.id), 0) AS derived
      FROM accounts a`);
    const mismatches = rows.filter((r) => r.cached !== r.derived).map((r) => r.id as string);
    const totalBalances = rows.reduce((s, r) => s + (r.cached as number), 0);
    const totalMinted = Number(this.run("SELECT COALESCE(SUM(amount), 0) AS m FROM transactions WHERE type = 'MINT'")[0]!.m);
    return { ok: mismatches.length === 0 && totalBalances === totalMinted, totalBalances, totalMinted, mismatches };
  }

  transactionCount(): number {
    return Number(this.run('SELECT COUNT(*) AS n FROM transactions')[0]!.n);
  }
}

class LedgerError extends Error {
  constructor(readonly reason: 'unknown_account') {
    super(reason);
  }
}
