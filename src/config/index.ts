import dotenv from 'dotenv';

dotenv.config();

const ENV = process.env;

const getEnvVar = (name: string): string => {
  const value = ENV[name];
  if (!value) {
    console.error(`FATAL ERROR: Environment variable ${name} is not defined.`);
    process.exit(1);
  }
  return value;
};

const config = {
  port: ENV.PORT || '5000',
  mongoURI: getEnvVar('MONGO_URI'),
  google: {
    clientId: getEnvVar('GOOGLE_CLIENT_ID'),
    clientSecret: getEnvVar('GOOGLE_CLIENT_SECRET'),
  },
  jwtSecret: getEnvVar('JWT_SECRET'),
  geminiApiKey: getEnvVar('GEMINI_API_KEY')
};

export default config;