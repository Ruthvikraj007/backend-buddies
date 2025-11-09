// Load environment variables FIRST
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from backend directory (two levels up from src/config)
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });
// touch file to trigger nodemon restart when env changes
