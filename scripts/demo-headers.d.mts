// Types for vite.config.ts - the module itself is plain JavaScript for the node tests.
export declare const FRAME_ANCESTORS: string[];
export declare const CONNECT_SRC: string[];
export declare function demoCsp(): string;
export declare function demoHeaders(): string;
export declare const DEMO_DIR: string;
export declare const HOME_BLOCK_START: string;
export declare const HOME_BLOCK_END: string;
export declare function homeHeadersBlock(): string;
export declare function withHomeBlock(headers: string): string;
