/**
 * expo-file-system-next.d.ts
 * Place at: src/types/expo-file-system-next.d.ts
 *
 * Teaches TypeScript that expo-file-system/next exists and exports
 * File, Directory, and Paths — the API shipped in expo-file-system 55+.
 *
 * The JS runtime already has these exports; this file only fixes the
 * "Cannot find module 'expo-file-system/next'" TypeScript error.
 */

declare module 'expo-file-system/next' {
  /**
   * Reference to a directory on the device file system.
   * Pass a Paths constant or a file:// URI string.
   */
  export class Directory {
    constructor(uriOrPath: string | PathConstant);
    readonly uri: string;
    /** Create the directory if it doesn't already exist. */
    create(): void;
    /** Delete this directory and all its contents. */
    delete(): void;
    /** Return true if the directory exists. */
    exists(): boolean;
    /** List all entries (files + subdirectories) inside this directory. */
    list(): (File | Directory)[];
  }

  /**
   * Reference to a file on the device file system.
   * Can be constructed from a URI string alone or from a Directory + filename.
   */
  export class File {
    constructor(uriOrPath: string | PathConstant);
    constructor(directory: Directory, filename: string);
    readonly uri: string;
    readonly name: string;
    readonly size: number | undefined;
    /** Return true if the file exists. */
    exists(): boolean;
    /** Delete the file. */
    delete(): void;
    /** Copy the file to a destination Directory. */
    copy(destination: Directory): File;
    /** Move the file to a destination Directory. */
    move(destination: Directory): File;
    /** Read the file as a UTF-8 string (synchronous). */
    text(): string;
    /** Read the file as a base64-encoded string (synchronous). */
    base64(): string;
    /** Read the file as raw bytes (synchronous). */
    bytes(): Uint8Array;
    /**
     * Write content to the file (synchronous).
     * @param content  UTF-8 string or base64 string
     * @param encoding 'utf8' (default) | 'base64'
     */
    write(content: string, encoding?: 'utf8' | 'base64'): void;
    /** Write raw bytes to the file (synchronous). */
    write(content: Uint8Array): void;
  }

  /** Opaque type used by Paths constants so they stay distinct from plain strings. */
  type PathConstant = string & { readonly __pathConstant: unique symbol };

  /**
   * Well-known directory paths for the current app.
   */
  export const Paths: {
    /** App's private cache directory — cleared by the OS under storage pressure. */
    readonly cache: PathConstant;
    /** App's private documents directory — persisted across updates. */
    readonly document: PathConstant;
    /** App's private temporary directory. */
    readonly temp: PathConstant;
    /** App bundle directory (read-only). */
    readonly bundle: PathConstant;
    /** Path to the main app bundle (read-only). */
    readonly mainBundle: PathConstant;
  };
}
