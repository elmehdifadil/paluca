export interface PlatformStorage {
  read(): Record<string, any> | null;
  write(data: Record<string, any>): void;
  upload(key: string, data: Buffer, contentType: string): Promise<string>;
  download(key: string): Promise<{ data: ArrayBuffer; contentType: string } | null>;
  backup?(data: Record<string, any>): Promise<string>;
}
