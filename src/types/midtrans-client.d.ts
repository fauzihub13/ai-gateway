declare module 'midtrans-client' {
  export interface SnapConfig {
    isProduction: boolean;
    serverKey: string;
    clientKey: string;
  }
  export interface CreateTransactionResponse {
    token: string;
    redirect_url: string;
  }
  export interface TransactionStatusResponse {
    transaction_status: string;
    fraud_status?: string;
    gross_amount?: string;
    order_id?: string;
  }
  export class Snap {
    constructor(config: SnapConfig);
    createTransaction(params: Record<string, unknown>): Promise<CreateTransactionResponse>;
    transaction: {
      status(orderId: string): Promise<TransactionStatusResponse>;
    };
  }
  const midtransClient: { Snap: typeof Snap };
  export default midtransClient;
}