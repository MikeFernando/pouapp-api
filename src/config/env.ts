import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing env ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 3333),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  jwtSecret: required('JWT_SECRET', 'dev-pouapp-secret'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
};
