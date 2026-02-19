import { MercadoPagoConfig, Payment, PreApproval } from "mercadopago"

const mp = new MercadoPagoConfig({
  accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN!,
})

export const mpPayment = new Payment(mp)
export const mpPreApproval = new PreApproval(mp)
