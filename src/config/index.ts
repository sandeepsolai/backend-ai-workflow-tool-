import dotenv from 'dotenv';
dotenv.config();

// Define an interface for the expected structure of our configuration
interface AppConfig {
  port: number;
  mongoURI: string;
  google: {
    clientId: string;
    clientSecret: string;
  };
  jwtSecret: string;
  geminiApiKey: string;
  clientURL: string; // Add the client URL here
}

// Helper function to get a required environment variable
const getEnvVar = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    console.error(`FATAL ERROR: Environment variable ${name} is not defined.`);
    process.exit(1);
  }
  return value;
};

// Create the config object and explicitly type it with our interface
const config: AppConfig = {
  port: parseInt(process.env.PORT || '5000', 10),
  mongoURI: getEnvVar('MONGO_URI'),
  google: {
    clientId: getEnvVar('GOOGLE_CLIENT_ID'),
    clientSecret: getEnvVar('GOOGLE_CLIENT_SECRET'),
  },
  jwtSecret: getEnvVar('JWT_SECRET'),
  geminiApiKey: getEnvVar('GEMINI_API_KEY'),
  clientURL: process.env.CLIENT_URL || 'http://localhost:5173' // Add a default for local dev
};

// Use Object.freeze to prevent accidental modifications to the config at runtime
export default Object.freeze(config);
