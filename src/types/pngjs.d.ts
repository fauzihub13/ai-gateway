declare module 'pngjs' {
  export interface PngData {
    width: number;
    height: number;
    data: Buffer;
  }
  export const PNG: {
    sync: { read(buffer: Buffer): PngData };
  };
}
