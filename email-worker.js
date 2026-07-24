// Cloudflare Email Worker — imovelemdolar.com.br
// Todo email do domínio: 1) encaminha pra marciogomesvip@gmail.com
//                        2) entrega o MIME bruto pro CRM (app.imovelemdolar.com.br)
export default {
  async email(message, env, ctx) {
    // 1) forward (só funciona depois que o destino for verificado na Cloudflare)
    try {
      await message.forward('marciogomesvip@gmail.com');
    } catch (e) {
      console.log('forward falhou: ' + e.message);
    }
    // 2) entrega pro CRM
    try {
      const raw = await new Response(message.raw).arrayBuffer();
      const r = await fetch('https://app.imovelemdolar.com.br/api/email/inbound', {
        method: 'POST',
        headers: {
          'content-type': 'application/octet-stream',
          'x-email-secret': env.EMAIL_INBOUND_SECRET,
          'x-envelope-to': message.to,
        },
        body: raw,
      });
      console.log('CRM inbound: ' + r.status);
    } catch (e) {
      console.log('CRM inbound falhou: ' + e.message);
    }
  },
};
