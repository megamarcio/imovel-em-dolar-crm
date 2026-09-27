// Cloudflare Email Worker — imovelemdolar-email (catch-all de imovelemdolar.com.br)
// 1) encaminha pra marciogomesvip@gmail.com  2) entrega pro CRM  3) entrega na Caixa Única
// Fonte publicada pela Caixa Única: caixa-unica/worker/imovelemdolar-email.js (python scripts/cf_email.py imovel-worker)
export default {
  async email(message, env, ctx) {
    try {
      await message.forward('marciogomesvip@gmail.com');
    } catch (e) {
      console.log('forward falhou: ' + e.message);
    }
    const raw = await new Response(message.raw).arrayBuffer();
    const post = async (name, url, headers) => {
      try {
        const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-envelope-to': message.to, ...headers }, body: raw });
        console.log(`${name}: ${r.status}`);
      } catch (e) {
        console.log(`${name} falhou: ${e.message}`);
      }
    };
    await Promise.all([
      post('CRM inbound', 'https://app.imovelemdolar.com.br/api/email/inbound', { 'x-email-secret': env.EMAIL_INBOUND_SECRET }),
      post('Caixa Única', 'https://caixa.cchub.com.br/api/inbound', { 'x-inbound-secret': env.CAIXA_INBOUND_SECRET }),
    ]);
  },
};
