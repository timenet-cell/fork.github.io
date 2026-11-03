/**
 * Porque uma entrada ou uma prova foi recusada. `code` é estável e igual ao
 * `LedgerError::code()` do Rust (packages/core-ledger/src/lib.rs).
 */
                        
                                                                                                         
                                                                                       

export class LedgerError extends Error {
           code            ;
  constructor(code            , detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'LedgerError';
    this.code = code;
  }
}

export const schema = (detail        )              => new LedgerError('bad_schema', detail);
