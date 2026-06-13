declare module 'sql.js/dist/sql-wasm-browser.js' {
  export interface Database {
    new(data?: Uint8Array): Database
    run(sql: string, params?: any[]): void
    prepare(sql: string): Statement
    export(): Uint8Array
  }

  export interface Statement {
    bind(params: any[]): void
    step(): boolean
    getAsObject(): Record<string, any>
    free(): void
  }

  interface SqlJsConfig {
    locateFile: (filename: string) => string
  }

  interface SqlJsModule {
    Database: typeof Database
  }

  export default function initSqlJs(config: SqlJsConfig): Promise<SqlJsModule>
}