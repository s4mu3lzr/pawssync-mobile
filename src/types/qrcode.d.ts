declare module 'qrcode' {
  export interface QRCodeOptions {
    errorCorrectionLevel?: 'H';
    margin?: number;
    width?: number;
    color?: {
      dark?: string;
      light?: string;
    };
  }

  export function toDataURL(text: string, options?: QRCodeOptions): Promise<string>;
}
