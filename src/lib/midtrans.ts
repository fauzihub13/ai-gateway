import midtransClient from 'midtrans-client';

export const snap = new midtransClient.Snap({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  serverKey: process.env.MIDTRANS_SERVER_KEY ?? '',
  clientKey: process.env.MIDTRANS_CLIENT_KEY ?? '',
});

export type MappedStatus = 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED' | 'REFUNDED';

export function mapMidtransStatus(transactionStatus: string, fraudStatus?: string): MappedStatus {
  switch (transactionStatus) {
    case 'capture':
      return fraudStatus === 'accept' ? 'PAID' : 'PENDING';
    case 'settlement':
      return 'PAID';
    case 'pending':
      return 'PENDING';
    case 'deny':
    case 'cancel':
      return 'FAILED';
    case 'expire':
      return 'EXPIRED';
    case 'refund':
    case 'partial_refund':
      return 'REFUNDED';
    default:
      return 'PENDING';
  }
}