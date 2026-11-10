# pouapp-api

Backend Node.js do **PouApp** (TypeScript + Express).

## Stack

- Node.js 20+
- TypeScript
- Express
- Zod
- JWT + bcrypt
- Store em memória (seed local para desenvolvimento)

## Subir

```bash
cd ~/pouapp-api
npm install
npm run dev
```

API em `http://localhost:3333`.

## Login seed

- e-mail: `edipo@pouapp.com`
- senha: `123456`

## Rotas

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| GET | `/health` | não | healthcheck |
| POST | `/auth/register` | não | cria conta |
| POST | `/auth/login` | não | login |
| GET | `/auth/me` | sim | usuário autenticado |
| GET | `/customers` | sim | lista clientes (`search`, `status`) |
| POST | `/customers` | sim | cria cliente |
| PATCH | `/customers/:id/status` | sim | ativa/desativa |
| GET | `/products` | sim | lista produtos |
| POST | `/products` | sim | cria produto |
| PATCH | `/products/:id` | sim | atualiza produto |
| GET | `/business/profile` | sim | perfil Pix |
| PUT | `/business/profile` | sim | salva chave Pix |

## Exemplo

```bash
curl -s http://localhost:3333/health

TOKEN=$(curl -s -X POST http://localhost:3333/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"edipo@pouapp.com","password":"123456"}' | jq -r .token)

curl -s http://localhost:3333/customers \
  -H "authorization: Bearer $TOKEN"
```

## Próximos passos

- Persistência (Postgres)
- Notas / recebimentos / sync com o app Flutter
- Deploy (Fly/Railway)
