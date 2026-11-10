# pouapp-api

Backend Node.js do **PouApp** (TypeScript + Express).

## Stack

- Node.js 20+
- TypeScript
- Express
- Zod
- JWT (access) + refresh opaco rotativo + bcrypt
- Helmet + rate limit
- Store em memória (seed local para desenvolvimento)

## Subir

```bash
cd pouapp-api
cp .env.example .env
npm install
npm run dev
```

API em `http://localhost:3333`.

## Login seed

- e-mail: `edipo@pouapp.com`
- senha: `Edipo123`

## Rotas

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| GET | `/health` | não | healthcheck |
| POST | `/auth/register` | não | cria conta |
| POST | `/auth/login` | não | login (access + refresh) |
| POST | `/auth/refresh` | body `refreshToken` | rotaciona tokens |
| POST | `/auth/logout` | body `refreshToken` | revoga refresh |
| GET | `/auth/me` | sim | usuário autenticado |
| GET | `/customers` | sim | lista clientes (`search`, `status`) |
| POST | `/customers` | sim | cria cliente |
| PATCH | `/customers/:id/status` | sim | ativa/desativa |
| GET | `/products` | sim | lista produtos |
| POST | `/products` | sim | cria produto |
| PATCH | `/products/:id` | sim | atualiza produto |
| GET | `/business/profile` | sim | perfil Pix |
| PUT | `/business/profile` | sim | salva chave Pix |

## Auth seguro

- Senha: mínimo 8 caracteres, com letra e número; hash bcrypt (cost 12)
- Access JWT curto (`15m`) com `iss`, `aud`, `jti`
- Refresh opaco (`30d`), armazenado só como SHA-256; rotação a cada uso
- Reuso de refresh revoga a família inteira
- Rate limit em login/register/refresh
- Lockout após 5 falhas (15 min) por e-mail+IP

## Exemplo

```bash
curl -s http://localhost:3333/health

LOGIN=$(curl -s -X POST http://localhost:3333/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"edipo@pouapp.com","password":"Edipo123"}')

ACCESS=$(echo "$LOGIN" | jq -r .accessToken)
REFRESH=$(echo "$LOGIN" | jq -r .refreshToken)

curl -s http://localhost:3333/auth/me \
  -H "authorization: Bearer $ACCESS"

LOGIN=$(curl -s -X POST http://localhost:3333/auth/refresh \
  -H 'content-type: application/json' \
  -d "{\"refreshToken\":\"$REFRESH\"}")

curl -s -X POST http://localhost:3333/auth/logout \
  -H 'content-type: application/json' \
  -d "{\"refreshToken\":\"$(echo "$LOGIN" | jq -r .refreshToken)\"}"
```

## Próximos passos

- Persistência (Postgres)
- Notas / recebimentos / sync com o app Flutter
- Deploy (Fly/Railway)
