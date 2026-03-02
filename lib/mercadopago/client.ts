import { MercadoPagoConfig, Preference, PreApproval, Payment } from "mercadopago";

// Singleton Mercado Pago client
let client: MercadoPagoConfig | null = null;

export function getMercadoPagoClient(): MercadoPagoConfig {
  if (!client) {
    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) {
      throw new Error("MP_ACCESS_TOKEN is not configured");
    }
    client = new MercadoPagoConfig({ accessToken });
  }
  return client;
}

export function getPreferenceClient() {
  return new Preference(getMercadoPagoClient());
}

export function getPreApprovalClient() {
  return new PreApproval(getMercadoPagoClient());
}

export function getPaymentClient() {
  return new Payment(getMercadoPagoClient());
}
