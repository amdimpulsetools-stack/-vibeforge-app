import { MercadoPagoConfig, PreApproval, Payment } from "mercadopago";

let config: MercadoPagoConfig | null = null;

function getConfig() {
  if (!config) {
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!accessToken) {
      throw new Error("MERCADOPAGO_ACCESS_TOKEN is not defined");
    }
    config = new MercadoPagoConfig({ accessToken });
  }
  return config;
}

export function getPreApprovalClient() {
  return new PreApproval(getConfig());
}

export function getPaymentClient() {
  return new Payment(getConfig());
}
