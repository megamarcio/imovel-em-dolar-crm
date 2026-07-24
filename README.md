# CRM Imóvel em Dólar

CRM simples em https://app.imovelemdolar.com.br — leads (kanban + lista), WhatsApp via UAZAPI e inbox de emails do domínio.

- **Stack:** Node 20 + Express + better-sqlite3 (servidor único) · React 18 + Vite + TS (SPA) · visual dark do R3 Bot Studio
- **WhatsApp:** instância UAZAPI +1 689 349-2919 (proxy ao vivo de chats/mensagens, envio, QR de reconexão). Webhook de mensagens cria lead automático.
- **Emails:** Cloudflare Email Routing (catch-all do domínio) → Worker `imovelemdolar-email` → encaminha pra marciogomesvip@gmail.com **e** entrega o MIME em `/api/email/inbound` (parseado com mailparser, vira lead automático). Código do worker: `email-worker.js` (deployado na Cloudflare).
- **Login:** senha única (`ADMIN_PASSWORD`), cookie assinado 90 dias.

## Deploy automatizado (VPS 82)

O app roda como stack Swarm `imovel_crm` atrás do Traefik (cert Let's Encrypt). Segredos vivem só na VPS em `/opt/imovel_crm/stack.deploy.yml` (chmod 600; modelo em `stack.yml`).

```bash
tar czf /tmp/imovel_crm.tgz --exclude=node_modules --exclude=client/node_modules --exclude=client/dist --exclude=data .
scp /tmp/imovel_crm.tgz root@82.25.86.82:/tmp/
ssh root@82.25.86.82 "cd /opt/imovel_crm && tar xzf /tmp/imovel_crm.tgz && docker build -t imovel_crm:latest . && docker service update --force imovel_crm_crm"
```

Banco SQLite em `/opt/imovel_crm/data/crm.db` (volume).

## Rotas principais

- `POST /api/login` · `GET /api/leads` · `POST/PATCH/DELETE /api/leads/:id`
- `GET /api/wa/status|chats|messages` · `POST /api/wa/send|connect`
- `POST /api/wa/webhook/:secret` (UAZAPI) · `POST /api/email/inbound` (Cloudflare Worker)
- `GET /api/emails` · `GET/DELETE /api/emails/:id`
