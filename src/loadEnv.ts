import { config } from "dotenv";

// Deployment variables take precedence; local settings take precedence over .env.
config({ path: [".env.local", ".env"], quiet: true });
